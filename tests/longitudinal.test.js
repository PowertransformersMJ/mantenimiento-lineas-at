// ============================================================================
// tests/longitudinal.test.js — la carga sobre el EJE de la línea
// ----------------------------------------------------------------------------
// Ningún valor esperado sale de ejecutar el módulo y copiar lo que dio. Salen de:
//
//   (a) TRIGONOMETRÍA EXACTA. El factor longitudinal es cos(α/2): vale 1 en
//       recta, cos(30°)=√3/2 a 60°, y 0 a 180°. Y su compañero sen(α/2) cierra
//       la identidad pitagórica cos²+sen²=1 para CUALQUIER ángulo — eso se
//       comprueba de golpe sobre un barrido.
//   (b) IDENTIDADES DE COHERENCIA con el módulo hermano: con los DOS tiros
//       iguales, la transversal que sale de la descomposición exacta,
//       (H₁+H₂)·sen(α/2), tiene que reducirse EXACTAMENTE a 2H·sen(α/2), que es
//       `cargas.factorTransversal`. Si las dos mitades del cálculo no coinciden
//       ahí, una de las dos está mal.
//   (c) CASOS DEGENERADOS con respuesta obvia: tiros iguales → cero exacto;
//       α = 180 → el eje longitudinal no existe; un lado ausente → hueco, jamás
//       un cero que se leería como «no hay desequilibrio».
//
// LO QUE MÁS SE VIGILA AQUÍ NO ES UN NÚMERO, SON DOS NEGATIVAS:
//   · que el SIGNO no se pierda nunca (el sentido se invierte entre estados, y
//     es lo que decide si hace falta retenida a un lado o a los dos), y
//   · que un hueco NUNCA se convierta en cero. Un lado que no llegó valdría 0 y
//     produciría el desequilibrio MÁXIMO posible, leyéndose además igual que un
//     terminal legítimo. Es el error más caro que puede cometer este archivo.
//
// ⚠️ Todos los datos son SINTÉTICOS: este repositorio es público (L-23).
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  factorLongitudinal, factorTransversalPostRotura,
  normalizarEstados, terminalLongitudinal, desequilibrioLongitudinal,
  roturaEnAnclaje, utilizacionLongitudinal, longitudinalDeLaLinea,
  CLAVES_ESTADO, PISO_VALIDEZ_PCT_EDS, DESAJUSTE_TENDIDO_PCT_RTS,
  UMBRAL_UTILIZACION_LONGITUDINAL_PCT, UMBRAL_UTILIZACION_LONGITUDINAL_DECLARADA_PCT,
  CRITERIO_UTILIZACION_LONGITUDINAL,
  SIN_CAPACIDAD_LONGITUDINAL, SIN_VEREDICTO_SUSPENSION,
} from '../nucleo/longitudinal.js';
import { factorTransversal } from '../nucleo/cargas.js';
import { FUNCIONES_ANCLA } from '../nucleo/mecanica.js';

const AQUI = dirname(fileURLToPath(import.meta.url));

const cerca = (real, esperado, tol, msg) =>
  assert.ok(Number.isFinite(real) && Math.abs(real - esperado) <= tol,
    `${msg}: ${real} vs ${esperado} esperado (tolerancia ${tol})`);

/** 60° no tiene representación exacta en radianes binarios (ver cargas.test.js). */
const EPS = 1e-12;

/** Un estado con sus tres magnitudes, como lo devuelve `estadosDelTramo`. */
const estado = (nombre, H, t = 25, w = 1) => ({ nombre, H, t, w });

const tramo = (desde, hasta, tiros, t = { eds: 25, tMax: 75, viento: 25, tMin: 10 }) => ({
  desde: { nombre: desde }, hasta: { nombre: hasta },
  estados: {
    eds: estado('EDS / cada día', tiros.eds, t.eds),
    tMax: estado('Máxima temperatura', tiros.tMax, t.tMax),
    viento: estado('Máximo viento', tiros.viento, t.viento),
    tMin: estado('Mínima temperatura', tiros.tMin, t.tMin),
  },
});

const apoyo = (nombre, funcionEstructural, extra = {}) => ({
  nombre, funcionEstructural, tipoPunto: 'Estructura', ...extra,
});

// ════════════════════════════════════════════════════════════════════════════

describe('EL GUARDIÁN: la lista de funciones que anclan no puede divergir', () => {
  // Esta prueba es la que faltaba, y su ausencia costó un fallo real: `ANCLAN`
  // nació sin 'Derivación' y la suite pasaba 555/555 en verde con un apoyo de
  // derivación publicando CERO carga longitudinal en el informe firmable.
  //
  // No se puede importar `ANCLAN` (es interna, y exportarla solo para probarla
  // sería abrir el módulo por una prueba), así que se lee el ARCHIVO — igual que
  // `tests/nucleo.test.js` hace con el contrato. Si alguien añade una función
  // que ancla en un sitio y no en el otro, esto se pone rojo.
  test('ANCLAN de longitudinal.js == FUNCIONES_ANCLA de mecanica.js', () => {
    const fuente = readFileSync(join(AQUI, '..', 'nucleo', 'longitudinal.js'), 'utf-8');
    const bloque = /const ANCLAN\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/.exec(fuente);
    assert.ok(bloque, 'no se encontró ANCLAN en nucleo/longitudinal.js');
    const deLongitudinal = [...bloque[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

    assert.deepEqual(deLongitudinal.sort(), [...FUNCIONES_ANCLA].sort(),
      'la lista de longitudinal.js y la de mecanica.js divergieron: un apoyo caería '
      + 'en la rama equivocada y publicaría un número falso');
  });

  test('un apoyo de DERIVACIÓN no cae en la rama de suspensión', () => {
    // El caso concreto que el fallo producía: cero publicado, con una nota que
    // afirma «dentro de un tramo la tensión es común» — falsa en una derivación,
    // porque `mecanica.js` CORTA el tramo ahí.
    const r = longitudinalDeLaLinea(
      [apoyo('A', 'Terminal'), apoyo('B', 'Derivación', { deflexion_grados: 30 }), apoyo('C', 'Terminal')],
      [tramo('A', 'B', { eds: 1200, tMax: 700, viento: 1230, tMin: 1500 }),
       tramo('B', 'C', { eds: 1200, tMax: 1000, viento: 1255, tMin: 1290 })],
      { rts_kgf: 6000 },
    );
    const b = r.find((x) => x.apoyo === 'B');
    assert.equal(b.caso, 'desequilibrio', 'una derivación ANCLA: no es suspensión');
    assert.notEqual(b.permanente.flAdelanteMax_kgf, 0);
    assert.ok(!b.notas.some((n) => /Cero DEL MODELO/.test(n)),
      'no puede adjuntar la nota del cero de suspensión');
  });
});

describe('los dos factores geométricos: mismo ángulo, dos ejes', () => {
  test('cos(α/2): 1 en recta, √3/2 a 60°, 0 a 180°', () => {
    assert.equal(factorLongitudinal(0), 1);
    cerca(factorLongitudinal(60), Math.sqrt(3) / 2, EPS, 'factor a 60°');
    cerca(factorLongitudinal(180), 0, EPS, 'factor a 180°');
  });

  test('el eje longitudinal DESAPARECE cuando la línea se dobla del todo', () => {
    // A 180° los dos vanos son opuestos: no hay bisectriz sobre la que proyectar.
    // El límite correcto es 0, y sale de la forma cerrada — no de normalizar un
    // vector nulo, que daría NaN.
    const r = desequilibrioLongitudinal({
      tiroAtras_kgf: 1000, tiroAdelante_kgf: 3000, deflexion_grados: 180,
    });
    cerca(r.flPorConductor_kgf, 0, 1e-9, 'FL a 180°');
  });

  test('los dos factores cierran la identidad pitagórica en todo el rango', () => {
    for (let a = 0; a <= 180; a += 7.5) {
      const c = factorLongitudinal(a);
      const s = factorTransversalPostRotura(a);
      cerca(c * c + s * s, 1, EPS, `cos²+sen² a ${a}°`);
    }
  });

  test('COHERENCIA con cargas.js: con tiros iguales, la transversal coincide', () => {
    // La descomposición exacta da FT = (H₁+H₂)·sen(α/2). Con H₁=H₂=H tiene que
    // reducirse a 2H·sen(α/2), que es lo que publica `cargas.factorTransversal`.
    // Si esto falla, las dos mitades del cálculo no hablan del mismo apoyo.
    const H = 1500;
    for (const a of [0, 30, 60, 90, 118, 150, 180]) {
      const porDescomposicion = (H + H) * factorTransversalPostRotura(a);
      const porCargas = factorTransversal(a) * H;
      cerca(porDescomposicion, porCargas, 1e-9, `transversal a ${a}°`);
    }
  });

  test('entradas inválidas dan null, no un número', () => {
    for (const malo of [null, undefined, NaN, '90', -0.001, 180.001, Infinity]) {
      assert.equal(factorLongitudinal(malo), null, `entrada inválida: ${String(malo)}`);
      assert.equal(factorTransversalPostRotura(malo), null);
    }
  });
});

describe('desequilibrio: la DIFERENCIA, con signo, nunca la suma', () => {
  test('tiros iguales dan CERO EXACTO, no un residuo', () => {
    const r = desequilibrioLongitudinal({
      tiroAtras_kgf: 2000, tiroAdelante_kgf: 2000, deflexion_grados: 60,
    });
    assert.equal(r.flPorConductor_kgf, 0);
    assert.equal(r.sentido, 'nulo', 'un cero exacto NO es «hacia adelante»');
  });

  test('en recta la diferencia pasa entera: 500 kgf de más son 500 kgf', () => {
    const r = desequilibrioLongitudinal({
      tiroAtras_kgf: 2000, tiroAdelante_kgf: 2500, deflexion_grados: 0,
    });
    assert.equal(r.flPorConductor_kgf, 500);   // (2500−2000)·cos(0) = 500 exacto
    assert.equal(r.sentido, 'adelante');
  });

  test('el signo se invierte al invertir los lados', () => {
    const a = desequilibrioLongitudinal({ tiroAtras_kgf: 2000, tiroAdelante_kgf: 2500, deflexion_grados: 40 });
    const b = desequilibrioLongitudinal({ tiroAtras_kgf: 2500, tiroAdelante_kgf: 2000, deflexion_grados: 40 });
    cerca(a.flPorConductor_kgf, -b.flPorConductor_kgf, 1e-9, 'simetría del signo');
    assert.equal(a.sentido, 'adelante');
    assert.equal(b.sentido, 'atras');
  });

  test('NO es la suma: con 2000 y 2500 el resultado es del orden de 500, no de 4500', () => {
    const r = desequilibrioLongitudinal({
      tiroAtras_kgf: 2000, tiroAdelante_kgf: 2500, deflexion_grados: 30,
    });
    assert.ok(Math.abs(r.flPorConductor_kgf) < 600, 'sumar daría un orden de magnitud de más');
  });

  test('un lado ausente NO se toma como cero: la fila queda sin número', () => {
    // Es el error más caro posible: 0 produciría el desequilibrio MÁXIMO (= H del
    // otro lado) y se leería igual que un terminal legítimo.
    const r = desequilibrioLongitudinal({ tiroAdelante_kgf: 2500, deflexion_grados: 30 });
    assert.equal(r.flPorConductor_kgf, null);
    assert.equal(r.sentido, null);
    assert.ok(r.componentes.faltan.some((x) => /tiroAtras_kgf/.test(x)));
  });

  test('sin `nFasesAmarradas` sale el número POR CONDUCTOR y el total queda null', () => {
    const r = desequilibrioLongitudinal({ tiroAtras_kgf: 2000, tiroAdelante_kgf: 2500, deflexion_grados: 0 });
    assert.equal(r.flPorConductor_kgf, 500);
    assert.equal(r.fl_kgf, null, 'el total no se inventa multiplicando por un 3 supuesto');
    const con = desequilibrioLongitudinal({ tiroAtras_kgf: 2000, tiroAdelante_kgf: 2500, deflexion_grados: 0, nFasesAmarradas: 4 });
    assert.equal(con.fl_kgf, 2000);
  });

  test('la hipótesis del tendido común viaja SIEMPRE en el resultado', () => {
    const r = desequilibrioLongitudinal({ tiroAtras_kgf: 2000, tiroAdelante_kgf: 2100, deflexion_grados: 10 });
    assert.match(r.componentes.hipotesis, /ADOPTADA/);
    assert.match(r.componentes.hipotesis, /mismo porcentaje/i);
  });
});

describe('terminal: el tiro entero, y el lado NO se supone', () => {
  test('el primer apoyo tira hacia adelante; el último, hacia atrás', () => {
    const a = terminalLongitudinal({ tiro_kgf: 3000, lado: 'adelante' });
    const b = terminalLongitudinal({ tiro_kgf: 3000, lado: 'atras' });
    assert.equal(a.flPorConductor_kgf, 3000);
    assert.equal(b.flPorConductor_kgf, -3000);
    assert.equal(a.sentido, 'adelante');
    assert.equal(b.sentido, 'atras');
  });

  test('sin `lado` NO devuelve un positivo por defecto', () => {
    const r = terminalLongitudinal({ tiro_kgf: 3000 });
    assert.equal(r.flPorConductor_kgf, null);
    assert.ok(r.componentes.faltan.some((x) => /lado/.test(x)));
  });

  test('el terminal NO se resuelve como un desequilibrio contra cero', () => {
    // Si se hiciera así, un tramo que no se pudo calcular (también 0) daría la
    // carga máxima posible del apoyo como si fuera un hecho.
    const term = terminalLongitudinal({ tiro_kgf: 3000, lado: 'adelante' });
    assert.equal(term.caso, 'terminal');
    const falso = desequilibrioLongitudinal({ tiroAtras_kgf: 0, tiroAdelante_kgf: 3000, deflexion_grados: 0 });
    assert.equal(falso.flPorConductor_kgf, null, 'un tiro de 0 kgf no es un dato: es un hueco');
  });
});

describe('rotura de conductor: el vector completo, no media verdad', () => {
  test('publica magnitud Y las dos componentes', () => {
    const r = roturaEnAnclaje({ tiroSano_kgf: 2000, deflexion_grados: 120, ladoRoto: 'atras' });
    assert.equal(r.fuerza_kgf, 2000);                       // kRes = 1 por defecto
    cerca(Math.abs(r.componenteLongitudinal_kgf), 2000 * Math.cos(60 * Math.PI / 180), 1e-9, 'longitudinal');
    cerca(r.componenteTransversal_kgf, 2000 * Math.sin(60 * Math.PI / 180), 1e-9, 'transversal');
  });

  test('a ángulos grandes la componente TRANSVERSAL es la mayor', () => {
    // Es la razón de publicar las dos: con α ≈ 119° la longitudinal es la mitad
    // pequeña, y una fila que solo la publicara entregaría media verdad.
    const r = roturaEnAnclaje({ tiroSano_kgf: 2000, deflexion_grados: 119, ladoRoto: 'atras' });
    assert.ok(r.componenteTransversal_kgf > Math.abs(r.componenteLongitudinal_kgf));
  });

  test('las dos componentes recomponen la fuerza (Pitágoras)', () => {
    for (const a of [0, 45, 90, 118, 170]) {
      const r = roturaEnAnclaje({ tiroSano_kgf: 1234, deflexion_grados: a, ladoRoto: 'adelante' });
      cerca(Math.hypot(r.componenteLongitudinal_kgf, r.componenteTransversal_kgf),
        r.fuerza_kgf, 1e-9, `recomposición a ${a}°`);
    }
  });

  test('kRes por defecto es 1 (cota superior), y no se admite mayor que 1', () => {
    assert.equal(roturaEnAnclaje({ tiroSano_kgf: 1000, deflexion_grados: 0, ladoRoto: 'atras' }).componentes.kRes, 1);
    const malo = roturaEnAnclaje({ tiroSano_kgf: 1000, deflexion_grados: 0, ladoRoto: 'atras', kRes: 1.4 });
    assert.equal(malo.fuerza_kgf, null, 'un kRes > 1 sería amplificación dinámica, que no se modela');
  });

  test('el caso accidental declara que NO lleva veredicto', () => {
    const r = roturaEnAnclaje({ tiroSano_kgf: 1000, deflexion_grados: 30, ladoRoto: 'atras' });
    assert.match(r.componentes.sinCriterio, /NO emite veredicto/);
    assert.match(r.componentes.hipotesis, /hipótesis MÍNIMA/);
  });
});

describe('utilización longitudinal: solo contra capacidad DECLARADA', () => {
  const cap = { valor_kgf: 8000, tipo: 'rotura', alturaReferencia_m: 12 };

  test('con capacidad y las dos alturas, compara momentos', () => {
    // (2000 × 12) / (8000 × 12) = 25 % exacto.
    const r = utilizacionLongitudinal({ fl_kgf: 2000, capacidad: cap, alturaAplicacion_m: 12 });
    assert.equal(r.utilizacion_pct, 25);
    assert.equal(r.estado, 'cumple');
    assert.equal(r.margen_kgf, 2000);   // 50 % de 8000 = 4000; ya hay 2000
  });

  test('el brazo importa: a media altura, la mitad de daño', () => {
    const r = utilizacionLongitudinal({ fl_kgf: 2000, capacidad: cap, alturaAplicacion_m: 6 });
    assert.equal(r.utilizacion_pct, 12.5);
  });

  test('el signo no cambia la utilización: se consume capacidad en los dos sentidos', () => {
    const a = utilizacionLongitudinal({ fl_kgf: 2000, capacidad: cap, alturaAplicacion_m: 12 });
    const b = utilizacionLongitudinal({ fl_kgf: -2000, capacidad: cap, alturaAplicacion_m: 12 });
    assert.deepEqual(a, b);
  });

  test('una capacidad que NO declara su tipo no se evalúa', () => {
    // El 50 % no es un porcentaje genérico: es el coeficiente de seguridad 2
    // sobre la ROTURA. Sin saber qué es el número declarado no hay contra qué
    // compararlo, y elegir mal es un factor 2 sobre el veredicto del apoyo.
    assert.equal(utilizacionLongitudinal({
      fl_kgf: 2000, capacidad: { valor_kgf: 8000, alturaReferencia_m: 12 }, alturaAplicacion_m: 12,
    }), null);
  });

  test('un tipo fuera de las tres palabras del contrato NO se aproxima al más parecido', () => {
    // 'ultima', 'nominal', 'ROTURA' en mayúsculas o un typo: la lista es CERRADA
    // (`33 · L-19`). Adivinar el más parecido decide entre el 50 % y el 100 %.
    for (const tipo of ['ultima', 'nominal', 'ROTURA', 'diseño', 'Rotura', '']) {
      assert.equal(utilizacionLongitudinal({
        fl_kgf: 2000, capacidad: { ...cap, tipo }, alturaAplicacion_m: 12,
      }), null, `el tipo «${tipo}» no está en el contrato: no se interpreta`);
    }
  });

  test('EL TIPO GOBIERNA EL UMBRAL: rotura al 50 %, admisible y diseno al 100 %', () => {
    // Ésta es la prueba que cambió con la especificación COMPLETA (ADR-012): la
    // versión anterior afirmaba que 'admisible' no se evaluaba. Sí se evalúa —
    // contra el 100 %, porque ese valor YA lleva su factor de seguridad dentro.
    // Partirlo otra vez por la mitad aplicaría dos veces el mismo margen y
    // sacaría «revisar» sobre apoyos sanos.
    const con = (tipo) => utilizacionLongitudinal({
      fl_kgf: 2000, capacidad: { ...cap, tipo }, alturaAplicacion_m: 12,
    });

    assert.equal(con('rotura').umbralAplicado_pct, 50);
    assert.equal(con('admisible').umbralAplicado_pct, 100);
    assert.equal(con('diseno').umbralAplicado_pct, 100);

    // El porcentaje consumido es el MISMO (25 %): lo que cambia es el listón.
    for (const tipo of ['rotura', 'admisible', 'diseno']) {
      assert.equal(con(tipo).utilizacion_pct, 25, `utilización con «${tipo}»`);
    }

    // Y el margen se calcula con el umbral APLICADO, no con el 50 fijo: si no,
    // la misma fila publicaría «cumple» con un margen negativo al lado.
    assert.equal(con('rotura').margen_kgf, 2000);      // 50 % de 8000 = 4000 − 2000
    assert.equal(con('admisible').margen_kgf, 6000);   // 100 % de 8000 = 8000 − 2000
    assert.equal(con('diseno').margen_kgf, 6000);
  });

  test('al 80 %, una capacidad de rotura dice «revisar» y una admisible «cumple»', () => {
    // El factor 2 entre los dos umbrales, visto en el veredicto de un apoyo.
    const con = (tipo) => utilizacionLongitudinal({
      fl_kgf: 6400, capacidad: { ...cap, tipo }, alturaAplicacion_m: 12,
    });
    assert.equal(con('rotura').estado, 'revisar');
    assert.ok(con('rotura').margen_kgf < 0);
    assert.equal(con('admisible').estado, 'cumple');
    assert.ok(con('admisible').margen_kgf > 0);
  });

  test('el veredicto declara CONTRA QUÉ se comparó, con esas palabras', () => {
    // El `criterio` va al informe firmable: quien revisa tiene que poder
    // discutir el número sin abrir el código.
    const r = utilizacionLongitudinal({
      fl_kgf: 2000, alturaAplicacion_m: 12, alturaLibre_m: 14,
      capacidad: { ...cap, fuente: 'ficha del fabricante (sintética)' },
    });
    assert.match(r.criterio, /CRITERIO ADOPTADO \(sin norma citada\)/);
    assert.match(r.criterio, /rotura/);
    assert.match(r.criterio, /8000 kgf/);
    assert.match(r.criterio, /ficha del fabricante \(sintética\)/);
    assert.match(r.criterio, /50 %/);
    // El supuesto heredado viaja DENTRO del texto, no en un comentario del código.
    assert.match(r.criterio, /MISMA ALTURA/);
    assert.match(r.criterio, /ACCIDENTAL/);
    // Y una capacidad sin fuente lo dice, en vez de callarlo.
    assert.match(utilizacionLongitudinal({
      fl_kgf: 2000, capacidad: cap, alturaAplicacion_m: 12,
    }).criterio, /NO declara su fuente/);
  });

  test('una capacidad en cero o negativa es un error de captura, no una ausencia', () => {
    for (const valor_kgf of [0, -8000]) {
      assert.equal(utilizacionLongitudinal({
        fl_kgf: 2000, capacidad: { ...cap, valor_kgf }, alturaAplicacion_m: 12,
      }), null, `valor_kgf = ${valor_kgf} no es un dato`);
    }
  });

  test('las tres alturas tienen que ser coherentes: dos contradicciones más', () => {
    // a) el amarre por encima de la PUNTA del apoyo (geometría imposible).
    assert.equal(utilizacionLongitudinal({
      fl_kgf: 2000, capacidad: cap, alturaAplicacion_m: 11, alturaLibre_m: 10,
    }), null);
    // b) la capacidad declarada referida por encima de la punta: uno de los dos
    //    datos del inventario está mal, y el sistema no elige cuál.
    assert.equal(utilizacionLongitudinal({
      fl_kgf: 2000, capacidad: cap, alturaAplicacion_m: 9, alturaLibre_m: 10,
    }), null);
    // Con una punta coherente, el mismo caso SÍ da número: el chequeo nuevo es
    // más estricto, no un cambio de fórmula.
    assert.equal(utilizacionLongitudinal({
      fl_kgf: 2000, capacidad: cap, alturaAplicacion_m: 9, alturaLibre_m: 14,
    }).utilizacion_pct, 18.75);
  });

  test('sin altura de aplicación NO se supone que actúe en la referencia', () => {
    assert.equal(utilizacionLongitudinal({ fl_kgf: 2000, capacidad: cap }), null);
  });

  test('geometría imposible (amarre por encima de la referencia) no da número', () => {
    assert.equal(utilizacionLongitudinal({ fl_kgf: 2000, capacidad: cap, alturaAplicacion_m: 20 }), null);
  });

  test('pasado el umbral adoptado, «revisar» y margen negativo', () => {
    const r = utilizacionLongitudinal({ fl_kgf: 5000, capacidad: cap, alturaAplicacion_m: 12 });
    assert.equal(r.estado, 'revisar');
    assert.ok(r.margen_kgf < 0);
    assert.equal(UMBRAL_UTILIZACION_LONGITUDINAL_PCT, 50);
  });
});

describe('normalizar estados: se rechaza lo que no se puede comprobar', () => {
  test('acepta la forma rica de `estadosDelTramo`', () => {
    const { estados, motivo } = normalizarEstados(tramo('A', 'B', { eds: 1, tMax: 2, viento: 3, tMin: 4 }));
    assert.equal(motivo, null);
    assert.deepEqual(Object.keys(estados).sort(), [...CLAVES_ESTADO].sort());
    assert.equal(estados.tMin.H, 4);
    assert.equal(estados.tMax.t, 75);
  });

  test('acepta la forma del contrato (lista con tiro_kgf y temperatura_C)', () => {
    const { estados } = normalizarEstados({ estados: [
      { nombre: 'EDS / cada día', tiro_kgf: 1000, temperatura_C: 25, cargaUnitaria_kg_m: 1 },
      { nombre: 'Mínima temperatura', tiro_kgf: 1400, temperatura_C: 10, cargaUnitaria_kg_m: 1 },
    ] });
    assert.equal(estados.eds.H, 1000);
    assert.equal(estados.tMin.t, 10);
  });

  test('RECHAZA la forma aplanada de la vista, que sí acepta cargas.js', () => {
    // No es incoherencia: cargas.js solo necesita UN tiro; aquí hay que RESTAR
    // dos, y sin temperatura ni carga unitaria no se puede comprobar que sean
    // comparables.
    const { estados, motivo } = normalizarEstados({ hEds: 1000, hTMax: 800, hViento: 1200, hTMin: 1400 });
    assert.equal(estados, null);
    assert.match(motivo, /estados/);
  });

  test('sin estados, lo dice', () => {
    assert.match(normalizarEstados({}).motivo, /no trae sus estados/);
  });
});

describe('la línea entera: identidad, no conteo', () => {
  // A—B—C—D: anclas en A y D (terminales) y una retención en C.
  const APOYOS = [
    apoyo('A', 'Terminal'),
    apoyo('B', 'Suspensión', { deflexion_grados: 2 }),
    apoyo('C', 'Retención / anclaje', { deflexion_grados: 40 }),
    apoyo('D', 'Terminal'),
  ];
  const TRAMOS = [
    tramo('A', 'C', { eds: 1200, tMax: 700, viento: 1230, tMin: 1500 }),
    tramo('C', 'D', { eds: 1200, tMax: 1000, viento: 1255, tMin: 1290 }),
  ];
  const correr = (o = {}) => longitudinalDeLaLinea(APOYOS, TRAMOS, { rts_kgf: 6000, ...o });
  const de = (r, nombre) => r.find((x) => x.apoyo === nombre);

  test('una fila por estructura, y ninguna se pierde', () => {
    const r = correr();
    assert.equal(r.length, 4);
    assert.deepEqual(r.map((x) => x.apoyo), ['A', 'B', 'C', 'D']);
  });

  test('los terminales llevan el tiro ENTERO, con signos opuestos', () => {
    const r = correr();
    assert.equal(de(r, 'A').caso, 'terminal');
    assert.equal(de(r, 'D').caso, 'terminal');
    // A: el único vano sale hacia adelante → positivo. D: llega de atrás → negativo.
    assert.ok(de(r, 'A').permanente.flAdelanteMax_kgf > 0);
    assert.ok(de(r, 'D').permanente.flAtrasMax_kgf < 0);
    // Y es el tiro máximo del tramo, no una diferencia.
    assert.equal(de(r, 'A').permanente.flAdelanteMax_kgf, 1500);
  });

  test('la suspensión tiene fila propia con CERO DEL MODELO declarado', () => {
    const b = de(correr(), 'B');
    assert.equal(b.caso, 'suspension');
    assert.equal(b.permanente.flPorConductor_kgf, 0);
    assert.ok(b.notas.some((n) => /Cero DEL MODELO/.test(n)),
      'un cero sin explicar se lee como una medición');
  });

  test('el anclaje resta los tramos que lo NOMBRAN, no los que le tocan por posición', () => {
    const c = de(correr(), 'C');
    assert.equal(c.caso, 'desequilibrio');
    // A→C llega (tMax 700) y C→D sale (tMax 1000): la diferencia es +300·cos(20°).
    const esperado = (1000 - 700) * Math.cos(20 * Math.PI / 180);
    cerca(c.permanente.flAdelanteMax_kgf, esperado, 1e-9, 'desequilibrio a T máx');
  });

  test('EL SENTIDO SE INVIERTE entre estados, y la fila lo dice', () => {
    const c = de(correr(), 'C');
    // A T máx tira hacia adelante (+300); a T mín hacia atrás (1290−1500 = −210).
    assert.ok(c.permanente.flAdelanteMax_kgf > 0);
    assert.ok(c.permanente.flAtrasMax_kgf < 0);
    assert.match(c.permanente.estadoAdelante, /Máxima/);
    assert.match(c.permanente.estadoAtras, /Mínima/);
    assert.ok(c.notas.some((n) => /SE INVIERTE/.test(n)));
  });

  test('la INVERSIÓN solo se afirma si LOS DOS sentidos superan el ruido de obra', () => {
    // Cazado verificando la línea real en producción: un anclaje daba +173 kgf
    // hacia adelante y −27 hacia atrás con un ruido de tendido de 85 kgf, y la
    // pantalla afirmaba «tira hacia los dos lados». Ese segundo sentido es
    // indistinguible de una diferencia de tendido de obra.
    const conRuidoAlto = longitudinalDeLaLinea(APOYOS, TRAMOS, { rts_kgf: 25000 });
    const c = de(conRuidoAlto, 'C');
    // sensibilidad = 1 % de 25 000 = 250 kgf. Adelante ≈ 282 (pasa), atrás ≈ 197 (no).
    assert.ok(c.permanente.flAdelanteMax_kgf !== null && c.permanente.flAtrasMax_kgf !== null,
      'el cálculo sigue dando los dos sentidos');
    assert.equal(c.sentidoResoluble, true, 'el sentido DOMINANTE sí supera el ruido');
    assert.equal(c.inversionResoluble, false, 'pero la INVERSIÓN no se puede afirmar');
    assert.ok(!c.notas.some((n) => /SE INVIERTE/.test(n)),
      'no se afirma una inversión que el ruido de obra podría explicar');
    assert.ok(c.notas.some((n) => /indistinguible del ruido/.test(n)),
      'y se dice por qué no se afirma');
  });

  test('con los dos sentidos por encima del ruido, la inversión SÍ se afirma', () => {
    const c = de(correr(), 'C');   // RTS 6000 → ruido 60 kgf; 282 y 197 lo pasan
    assert.equal(c.inversionResoluble, true);
    assert.ok(c.notas.some((n) => /SE INVIERTE/.test(n) && /los DOS sentidos pesan/.test(n)));
  });

  test('un terminal nunca «invierte»: tiene un solo lado', () => {
    assert.equal(de(correr(), 'A').inversionResoluble, false);
  });

  test('un terminal cuyo tramo no trae tiro NO dice «el sentido no es concluyente»', () => {
    // El hallazgo (§ADR-013): con el tramo sin `H`, la fila salía `caso:
    // 'terminal'` con los seis campos en null y `sentidoResoluble: false`. En la
    // rama del terminal ese `false` quería decir «no se pudo calcular nada»; en
    // la del anclaje quiere decir «el número salió pero pesa menos que el ruido
    // de obra». Los tres consumidores leen el segundo significado, así que la
    // pantalla lo contaba en el KPI «sentido dudoso», el informe firmable
    // imprimía «el número sale pero el SENTIDO no es concluyente» y el CSV
    // escribía `Sentido_resoluble = no` — todo sobre un apoyo del que no se
    // calculó ni un número. En esta columna `false` es una AFIRMACIÓN; la
    // ausencia de dato es `null`, y una fila sin número es `no_evaluable`.
    const sinTiro = {
      desde: { nombre: 'A' }, hasta: { nombre: 'C' },
      estados: {
        eds: estado('EDS / cada día', null), tMax: estado('Máxima temperatura', null),
        viento: estado('Máximo viento', null), tMin: estado('Mínima temperatura', null),
      },
    };
    const a = de(longitudinalDeLaLinea(APOYOS, [sinTiro, TRAMOS[1]], { rts_kgf: 6000 }), 'A');

    assert.equal(a.caso, 'no_evaluable', 'sin un solo tiro no hay caso «terminal» que publicar');
    assert.notEqual(a.sentidoResoluble, false,
      '`false` significaría que el número salió y no supera el ruido de obra: aquí no salió ninguno');
    assert.equal(a.sentidoResoluble, null);
    assert.ok(a.noEvaluable, 'y tiene que decir por qué no hay número');
    assert.equal(a.permanente, null, 'sin envolvente no se publica una envolvente vacía');
  });

  test('el mayor desequilibrio NO está en el estado de mayor tiro', () => {
    // Verificado con el motor real y reproducido aquí: el mayor tiro es a T mín
    // (1500 kgf) y el mayor desequilibrio a T máx. Tomar el de mayor tiro —lo
    // que hace cargas.js— daría el número equivocado.
    const c = de(correr(), 'C');
    const porEstado = c.permanente.porEstado;
    const peor = porEstado.reduce((m, x) =>
      (Math.abs(x.flPorConductor_kgf) > Math.abs(m.flPorConductor_kgf) ? x : m));
    assert.match(peor.estadoTiro, /Máxima temperatura/);
  });

  test('el cero exacto del estado EDS se declara como cero DEL MODELO', () => {
    const c = de(correr(), 'C');
    const eds = c.permanente.porEstado.find((x) => /EDS/.test(x.estadoTiro));
    assert.equal(eds.flPorConductor_kgf, 0);
    assert.ok(c.notas.some((n) => /CERO EXACTO/.test(n) && /cero del modelo/i.test(n)));
  });

  test('la envolvente de un lado que ningún estado produce es null, NO cero', () => {
    // Un 0 con el nombre de un estado adosado sería un dato fabricado justo donde
    // el resto de los ceros son ceros declarados.
    const soloAdelante = longitudinalDeLaLinea(APOYOS, [
      tramo('A', 'C', { eds: 1200, tMax: 700, viento: 1230, tMin: 1200 }),
      tramo('C', 'D', { eds: 1200, tMax: 1000, viento: 1255, tMin: 1400 }),
    ], { rts_kgf: 6000 });
    const c = de(soloAdelante, 'C');
    assert.ok(c.permanente.flAdelanteMax_kgf > 0);
    assert.equal(c.permanente.flAtrasMax_kgf, null, 'nunca tira hacia atrás ≠ tira 0 kgf hacia atrás');
  });

  test('la sensibilidad al tendido viaja al lado del número', () => {
    const c = de(correr(), 'C');
    // 1 % de RTS 6000 = 60 kgf.
    assert.equal(c.sensibilidadTendido_kgf, (DESAJUSTE_TENDIDO_PCT_RTS / 100) * 6000);
    assert.equal(c.sentidoResoluble, true, '282 kgf están muy por encima de 60');
  });

  test('si el desequilibrio no supera el desajuste de obra, el SENTIDO no es concluyente', () => {
    const flojo = longitudinalDeLaLinea(APOYOS, [
      tramo('A', 'C', { eds: 1200, tMax: 1000, viento: 1230, tMin: 1300 }),
      tramo('C', 'D', { eds: 1200, tMax: 1010, viento: 1235, tMin: 1305 }),
    ], { rts_kgf: 60000 });     // RTS enorme → sensibilidad de 600 kgf
    const c = de(flojo, 'C');
    assert.equal(c.sentidoResoluble, false);
    assert.ok(c.notas.some((n) => /no es concluyente/.test(n)));
  });

  test('el piso de validez avisa cuando un lado se derrumbó EN EL MODELO', () => {
    const derrumbe = longitudinalDeLaLinea(APOYOS, [
      // A T máx el tramo que llega cae a 100 de 1200 = 8,3 % de su EDS.
      tramo('A', 'C', { eds: 1200, tMax: 100, viento: 1230, tMin: 1500 }),
      tramo('C', 'D', { eds: 1200, tMax: 1000, viento: 1255, tMin: 1290 }),
    ], { rts_kgf: 6000 });
    const c = de(derrumbe, 'C');
    assert.ok(c.notas.some((n) => new RegExp(`${PISO_VALIDEZ_PCT_EDS} %`).test(n)),
      'un número calculado sobre un tramo flojo pasa la guardia de los null: hay que avisarlo');
  });

  test('estados de temperaturas distintas NO se restan', () => {
    const raro = longitudinalDeLaLinea(APOYOS, [
      tramo('A', 'C', { eds: 1200, tMax: 700, viento: 1230, tMin: 1500 }, { eds: 25, tMax: 75, viento: 25, tMin: 10 }),
      tramo('C', 'D', { eds: 1200, tMax: 1000, viento: 1255, tMin: 1290 }, { eds: 25, tMax: 60, viento: 25, tMin: 10 }),
    ], { rts_kgf: 6000 });
    const c = de(raro, 'C');
    assert.ok(c.notas.some((n) => /no son comparables/.test(n)));
    assert.ok(!c.permanente.porEstado.some((x) => /Máxima temperatura/.test(x.estadoTiro)),
      'el estado con hipótesis distinta no puede aparecer en la envolvente');
  });

  test('sin función estructural declarada, no se decide nada', () => {
    const r = longitudinalDeLaLinea([apoyo('X', null), apoyo('Y', 'Terminal')], [], {});
    assert.equal(r[0].caso, 'no_evaluable');
    assert.match(r[0].noEvaluable, /funcionEstructural/);
  });

  test('un «Terminal» en mitad de la línea NO publica el tiro de un solo lado', () => {
    const r = longitudinalDeLaLinea([
      apoyo('A', 'Terminal'), apoyo('B', 'Terminal', { deflexion_grados: 5 }), apoyo('C', 'Terminal'),
    ], [tramo('A', 'B', { eds: 1200, tMax: 700, viento: 1230, tMin: 1500 }),
        tramo('B', 'C', { eds: 1200, tMax: 700, viento: 1230, tMin: 1500 })], {});
    assert.equal(de(r, 'B').caso, 'no_evaluable');
    assert.match(de(r, 'B').noEvaluable, /ramal|bajante/);
  });

  test('los empalmes no reciben fila', () => {
    const conEmpalme = [...APOYOS.slice(0, 2),
      { nombre: 'EMP', tipoPunto: 'Empalme', funcionEstructural: 'Suspensión' },
      ...APOYOS.slice(2)];
    assert.equal(longitudinalDeLaLinea(conEmpalme, TRAMOS, {}).length, 4);
  });

  test('el caso accidental va en estructura APARTE del permanente', () => {
    const c = de(correr(), 'C');
    assert.ok(c.permanente && c.accidental, 'los dos existen');
    assert.ok(c.accidental.atras && c.accidental.adelante, 'se evalúa la rotura de cada lado');
    // Y no hay ningún campo que los sume.
    assert.equal(c.permanente.fuerza_kgf, undefined);
  });

  test('un anclaje SIN ángulo no publica «0,0 kgf»: es un hueco, no un cero', () => {
    // Cazado por la auditoría. El guardián miraba `porEstado.length`, que cuenta
    // INTENTOS: con el ángulo sin resolver los cuatro estados dan null y el array
    // sigue teniendo cuatro entradas, así que `Math.max(null ?? 0, ...)` convertía
    // el hueco en 0 y la fila publicaba, EN PROSA y en el informe firmable, «el
    // mayor desequilibrio calculado (0,0 kgf) queda por debajo del ruido».
    const r = longitudinalDeLaLinea(
      [apoyo('A', 'Terminal'), apoyo('B', 'Retención / anclaje'), apoyo('C', 'Terminal')],
      [tramo('A', 'B', { eds: 1200, tMax: 700, viento: 1230, tMin: 1500 }),
       tramo('B', 'C', { eds: 1200, tMax: 1000, viento: 1255, tMin: 1290 })],
      { rts_kgf: 6000 },                       // sin deflexión y sin coordenadas
    );
    const b = de(r, 'B');
    assert.equal(b.caso, 'no_evaluable');
    assert.match(b.noEvaluable, /ángulo de quiebre/);
    assert.equal(b.sentidoResoluble, null, 'nunca `false`: no hubo número que comparar');
    assert.ok(!b.notas.some((n) => /0[.,]0 kgf/.test(n)),
      'no puede escribir un cero que nadie calculó');
  });

  test('la ROTURA toma el pico del lado SANO, no el del roto', () => {
    // Cazado por la auditoría y reproducido: con los dos tramos picando en
    // estados distintos, publicaba 1290 kgf donde la envolvente del tramo sano
    // son 1900 — 32 % por debajo y POR EL LADO INSEGURO.
    const r = longitudinalDeLaLinea(
      [apoyo('A', 'Terminal'), apoyo('B', 'Retención / anclaje', { deflexion_grados: 30 }), apoyo('C', 'Terminal')],
      [tramo('A', 'B', { eds: 1200, tMax: 700, viento: 1230, tMin: 1500 }),   // pica a tMin
       tramo('B', 'C', { eds: 1200, tMax: 1000, viento: 1900, tMin: 1290 })], // pica a viento
      { rts_kgf: 6000 },
    );
    const b = de(r, 'B');
    // Se rompe ATRÁS → sobrevive el de ADELANTE, cuya envolvente es 1900.
    assert.equal(b.accidental.atras.fuerza_kgf, 1900);
    assert.match(b.accidental.atras.estadoTiro, /viento/i, 'y rotulada con SU estado');
    // Se rompe ADELANTE → sobrevive el de ATRÁS, envolvente 1500.
    assert.equal(b.accidental.adelante.fuerza_kgf, 1500);
    assert.match(b.accidental.adelante.estadoTiro, /Mínima/);
  });

  test('un NOMBRE repetido no publica el tiro de otro apoyo', () => {
    // Es el único error que ninguna comprobación de conteo detecta: no altera
    // ninguna magnitud agregada, la tabla se ve idéntica, y voltea el lado.
    const r = longitudinalDeLaLinea(
      [apoyo('E07', 'Terminal'), apoyo('E08', 'Suspensión', { deflexion_grados: 1 }),
       apoyo('E07', 'Retención / anclaje', { deflexion_grados: 20 }), apoyo('E10', 'Terminal')],
      [tramo('E07', 'E08', { eds: 1200, tMax: 700, viento: 1230, tMin: 1500 }),
       tramo('E08', 'E07', { eds: 1200, tMax: 700, viento: 1230, tMin: 1500 }),
       tramo('E07', 'E10', { eds: 1200, tMax: 1000, viento: 1255, tMin: 1290 })],
      { rts_kgf: 6000 },
    );
    for (const f of r.filter((x) => x.apoyo === 'E07')) {
      assert.equal(f.caso, 'no_evaluable', 'con el nombre ambiguo no se publica número');
      assert.match(f.noEvaluable, /no identifica a un solo apoyo/);
      assert.equal(f.permanente, null);
    }
  });

  test('un «Terminal» con vano a los DOS lados se niega en vez de elegir uno', () => {
    const r = longitudinalDeLaLinea(
      [apoyo('A', 'Terminal', { deflexion_grados: 10 }), apoyo('B', 'Retención / anclaje', { deflexion_grados: 20 })],
      [tramo('X', 'A', { eds: 1200, tMax: 700, viento: 1230, tMin: 1500 }),
       tramo('A', 'B', { eds: 1200, tMax: 700, viento: 1230, tMin: 1500 })],
      { rts_kgf: 6000 },
    );
    const a = de(r, 'A');
    assert.equal(a.caso, 'no_evaluable');
    assert.match(a.noEvaluable, /DOS lados/);
  });

  test('la función es PURA: no toca lo que le entra', () => {
    const a = JSON.parse(JSON.stringify(APOYOS));
    const t = JSON.parse(JSON.stringify(TRAMOS));
    const antes = JSON.stringify([a, t]);
    longitudinalDeLaLinea(a, t, { rts_kgf: 6000 });
    assert.equal(JSON.stringify([a, t]), antes);
  });

  test('sin apoyos devuelve vacío, sin explotar', () => {
    assert.deepEqual(longitudinalDeLaLinea([], [], {}), []);
    assert.deepEqual(longitudinalDeLaLinea(null, null, {}), []);
  });
});

describe('EL GUARDIÁN: los tipos de capacidad no pueden divergir del contrato', () => {
  // Cuarta lista de dominio duplicada del sistema, y nace CON su guardián. La
  // única que nació sin él —`ANCLAN`— divergió y publicó un cero falso en un
  // informe firmable durante semanas, con 555 pruebas en verde (ADR-013).
  //
  // El núcleo no puede importar del contrato (no importa nada, CLAUDE.md §3.1),
  // así que se leen los DOS archivos como TEXTO y se comparan.
  test('TIPOS_CAPACIDAD_LONGITUDINAL == TipoCapacidadLongitudinal del contrato', () => {
    const nucleo = readFileSync(join(AQUI, '..', 'nucleo', 'longitudinal.js'), 'utf-8');
    const bNucleo = /const TIPOS_CAPACIDAD_LONGITUDINAL\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/
      .exec(nucleo);
    assert.ok(bNucleo, 'no se encontró TIPOS_CAPACIDAD_LONGITUDINAL en nucleo/longitudinal.js');

    const contrato = readFileSync(join(AQUI, '..', 'contratos', 'src', 'activos.ts'), 'utf-8');
    const bContrato = /TipoCapacidadLongitudinal\s*=\s*z\.enum\(\[([\s\S]*?)\]\)/.exec(contrato);
    assert.ok(bContrato, 'no se encontró TipoCapacidadLongitudinal en contratos/src/activos.ts');

    const leer = (b) => [...b[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    assert.deepEqual(leer(bNucleo), leer(bContrato),
      'la lista del núcleo y la del contrato divergieron: un tipo válido para uno y desconocido '
      + 'para el otro deja sin veredicto un apoyo que sí lo tiene, o al revés');
  });

  test('los tres tipos son exactamente los que el núcleo sabe puntuar', () => {
    // Que la lista y los umbrales no se separen: un tipo aceptado sin umbral
    // sería un veredicto sin criterio.
    const cap = (tipo) => utilizacionLongitudinal({
      fl_kgf: 1000, capacidad: { valor_kgf: 10000, tipo, alturaReferencia_m: 10 },
      alturaAplicacion_m: 10,
    });
    for (const tipo of ['rotura', 'admisible', 'diseno']) {
      assert.ok(cap(tipo) !== null, `«${tipo}» está en el contrato: tiene que puntuar`);
      assert.ok(cap(tipo).umbralAplicado_pct > 0);
    }
  });
});

describe('el veredicto longitudinal, de punta a punta (L-28: nadie llamaba a la función)', () => {
  // ⚠️ TODOS los datos son SINTÉTICOS y las capacidades están INVENTADAS para
  // esta prueba. Es el ÚNICO sitio donde puede verse funcionar el veredicto: en
  // el inventario real no hay ni una capacidad longitudinal declarada, y
  // sembrar una para «poder verlo» sería publicar un «cumple» sobre un número
  // que nadie firmó. Repositorio público (L-23).
  const CAPACIDAD = Object.freeze({
    valor_kgf: 20000, tipo: 'rotura', alturaReferencia_m: 12,
    fuente: 'ficha sintética de prueba',
  });
  const ALTURAS = { alturaAplicacion_m: 12, alturaLibre_m: 14 };

  const linea = (extraA = {}, extraC = {}) => [
    apoyo('A', 'Terminal', extraA),
    apoyo('B', 'Suspensión', { deflexion_grados: 2, ...extraC.B }),
    apoyo('C', 'Retención / anclaje', { deflexion_grados: 40, ...extraC.C }),
    apoyo('D', 'Terminal'),
  ];
  const TRAMOS = [
    tramo('A', 'C', { eds: 1200, tMax: 700, viento: 1230, tMin: 1500 }),
    tramo('C', 'D', { eds: 1200, tMax: 1000, viento: 1255, tMin: 1290 }),
  ];
  const correr = (apoyos, o = {}) =>
    longitudinalDeLaLinea(apoyos, TRAMOS, { rts_kgf: 6000, nFasesAmarradas: 3, ...o });
  const de = (r, nombre) => r.find((x) => x.apoyo === nombre);

  test('un TERMINAL con capacidad declarada SÍ recibe veredicto', () => {
    // Tiro entero: 1500 kgf por conductor (tMin) × 3 fases = 4500 kgf totales.
    // Momentos: (4500 × 12) / (20000 × 12) = 22,5 % exacto.
    const u = de(correr(linea({ capacidadLongitudinal: CAPACIDAD, ...ALTURAS })), 'A').utilizacion;
    assert.ok(u, 'la función existía desde ADR-012 y nadie la llamaba: esto es lo que lo cierra');
    assert.equal(u.utilizacion_pct, 22.5);
    assert.equal(u.estado, 'cumple');
    assert.equal(u.umbralAplicado_pct, 50);
    assert.equal(u.margen_kgf, 5500);   // 50 % de 20000 = 10000; ya hay 4500
    assert.match(u.criterio, /CRITERIO ADOPTADO/);
  });

  test('el veredicto se calcula sobre el TOTAL, nunca sobre el valor por conductor', () => {
    // Si se hubiera usado el valor por conductor (1500) saldría 7,5 % y
    // «cumple» donde el apoyo va al 90 %: dividir entre n es el «cumple» falso
    // más caro de este eje, y cae justo en los apoyos que llevan el tiro entero.
    const cap = { ...CAPACIDAD, valor_kgf: 10000 };
    const u = de(correr(linea({ capacidadLongitudinal: cap, ...ALTURAS })), 'A').utilizacion;
    assert.equal(u.utilizacion_pct, 45);   // (4500 × 12) / (10000 × 12)
    assert.equal(u.estado, 'cumple');
    assert.equal(de(correr(linea({
      capacidadLongitudinal: { ...CAPACIDAD, valor_kgf: 8000 }, ...ALTURAS,
    })), 'A').utilizacion.estado, 'revisar');   // 56,25 % > 50 %
  });

  test('un ANCLAJE se evalúa con la envolvente PERMANENTE, jamás con la accidental', () => {
    const c = de(correr(linea({}, { C: { capacidadLongitudinal: CAPACIDAD, ...ALTURAS } })), 'C');
    // Permanente: (1000 − 700) · cos(20°) por conductor, × 3 fases.
    const total = 300 * Math.cos((20 * Math.PI) / 180) * 3;
    cerca(c.utilizacion.utilizacion_pct, (total / 20000) * 100, 1e-9,
      'la utilización sale del desequilibrio permanente');
    // La rotura del conductor da fuerzas MUCHO mayores (1290 y 1500 kgf) y no
    // entra: es otra hipótesis de carga y no tiene criterio de aceptación.
    assert.ok(c.accidental.atras.fuerza_kgf > total, 'el accidental es mayor, y aun así no manda');
    assert.match(c.utilizacion.criterio, /ACCIDENTAL/);
  });

  test('`cargaRotura_kgf` NO alimenta este eje: sigue sin veredicto', () => {
    // Un apoyo con TODO lo que pide el eje transversal —rotura y altura libre—
    // y sin capacidad longitudinal. Deducirla sería confundir un ensayo
    // transversal en punta con una capacidad a lo largo de la línea.
    const a = de(correr(linea({ cargaRotura_kgf: 20000, ...ALTURAS })), 'A');
    assert.equal(a.utilizacion, null);
    assert.ok(a.notas.some((n) => /nadie ha declarado la capacidad/.test(n)),
      'y el motivo se publica: es un hueco del INVENTARIO, no un fallo del cálculo');
  });

  test('una capacidad pasada como valor de LÍNEA se ignora, y las filas lo siguen diciendo', () => {
    // Un veredicto heredado de otro apoyo es peor que no tener veredicto, en una
    // línea donde conviven concreto, metálico, madera, torre y torreta.
    const r = correr(linea(ALTURAS), { capacidadLongitudinal: CAPACIDAD });
    for (const fila of r) {
      assert.equal(fila.utilizacion, null, `${fila.apoyo} no puede heredar capacidad de la línea`);
    }
    assert.ok(de(r, 'A').notas.some((n) => /nadie ha declarado la capacidad/.test(n)));
  });

  test('con capacidad pero sin saber cuántas fases amarran, no hay veredicto', () => {
    // Es el estado de HOY aunque el inventario traiga la capacidad: el conteo no
    // está en el contrato, y NO se hereda de la carga transversal.
    const a = de(correr(linea({ capacidadLongitudinal: CAPACIDAD, ...ALTURAS }),
      { nFasesAmarradas: undefined }), 'A');
    assert.equal(a.utilizacion, null);
    assert.ok(a.notas.some((n) => /cuántas fases amarran/.test(n)));
    assert.ok(a.notas.some((n) => /cable de guarda/.test(n)),
      'y se dice por qué no se hereda el conteo del otro eje');
  });

  test('EL ESTADO DE HOY: sin conteo Y sin capacidad, la nota nombra los DOS huecos', () => {
    // Es exactamente lo que hoy publica el 100 % del inventario. Si la nota
    // nombrara solo el conteo, el hallazgo de fondo —que NADIE ha declarado una
    // capacidad longitudinal— quedaría escondido detrás de una deuda distinta, y
    // el inventario se corregiría dos veces: se declara el conteo, se vuelve a
    // mirar, y el veredicto sigue sin salir por otra razón.
    const a = de(correr(linea(ALTURAS), { nFasesAmarradas: undefined }), 'A');
    assert.equal(a.utilizacion, null);
    const nota = a.notas.find((n) => /Sin veredicto en el eje longitudinal/.test(n));
    assert.match(nota, /cuántas fases amarran/);
    assert.match(nota, /nadie ha declarado la capacidad/);
    assert.match(nota, /NO ES EL ÚNICO HUECO/);
  });

  test('una SUSPENSIÓN con capacidad declarada sigue SIN veredicto, y dice por qué', () => {
    // El «cumple al 0 %» más peligroso que este sistema podría emitir.
    const b = de(correr(linea({}, { B: { capacidadLongitudinal: CAPACIDAD, ...ALTURAS } })), 'B');
    assert.equal(b.caso, 'suspension');
    assert.equal(b.utilizacion, null);
    assert.ok(b.notas.some((n) => /cumple» al 0 %/.test(n)));
  });

  test('una fila ya no evaluable no reescribe el motivo: remite al suyo', () => {
    // Un solo dueño de esa frase. Repetirla con otras palabras es cómo dos
    // páginas del mismo informe acaban diciendo cosas distintas (ADR-014).
    const r = correr([
      apoyo('A', null, { capacidadLongitudinal: CAPACIDAD, ...ALTURAS }),
      apoyo('C', 'Retención / anclaje', { deflexion_grados: 40 }),
      apoyo('D', 'Terminal'),
    ]);
    const a = de(r, 'A');
    assert.equal(a.caso, 'no_evaluable');
    assert.equal(a.utilizacion, null);
    assert.ok(a.notas.some((n) => /primero falta la carga longitudinal/.test(n)));
  });

  test('cada hueco distinto se nombra distinto: se corrigen en sitios distintos', () => {
    const motivo = (cap, alturas = ALTURAS) => de(correr(linea({
      capacidadLongitudinal: cap, ...alturas,
    })), 'A').notas.join(' · ');

    assert.match(motivo({ ...CAPACIDAD, valor_kgf: 0 }), /error de captura/);
    assert.match(motivo({ valor_kgf: 20000, alturaReferencia_m: 12 }), /no dice QUÉ es/);
    assert.match(motivo({ ...CAPACIDAD, tipo: 'ultima' }), /no es ninguno de los tres/);
    assert.match(motivo({ valor_kgf: 20000, tipo: 'rotura' }), /sin la altura a la que vale/);
    assert.match(motivo(CAPACIDAD, { alturaLibre_m: 14 }), /falta la altura a la que el conductor/);
    assert.match(motivo(CAPACIDAD, { alturaAplicacion_m: 15, alturaLibre_m: 14 }),
      /por encima de la punta/);
    assert.match(motivo({ ...CAPACIDAD, alturaReferencia_m: 15 },
      { alturaAplicacion_m: 13, alturaLibre_m: 14 }), /por encima de la punta/);
    assert.match(motivo(CAPACIDAD, { alturaAplicacion_m: 13, alturaLibre_m: 14 }),
      /por encima de los 12.00 m a los que la capacidad fue declarada/);
  });

  test('sigue siendo PURA con capacidad declarada: no escribe en el apoyo', () => {
    const apoyos = linea({ capacidadLongitudinal: CAPACIDAD, ...ALTURAS });
    const antes = JSON.stringify(apoyos);
    correr(apoyos);
    assert.equal(JSON.stringify(apoyos), antes);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LAS NEGATIVAS, UNA POR UNA
// ----------------------------------------------------------------------------
// Este sistema no se rompe publicando un error: se rompe publicando un veredicto
// que no puede sostener. Por eso lo que más se vigila de este eje no es el
// número que sale, sino las DIECISÉIS maneras de no tener veredicto — y que cada
// una diga cuál es, porque cada una se corrige en un sitio distinto y por una
// persona distinta: unas en el inventario, otras en la ficha del fabricante,
// otras en el levantamiento y una en el contrato.
//
// Cada prueba de este bloque declara en su comentario QUÉ SE PUBLICARÍA en el
// informe firmable si esa negativa fallara. Ése es el daño que evita, y es la
// única razón por la que la prueba existe.
//
// ⚠️ Datos SINTÉTICOS y capacidad INVENTADA. El repositorio es público (L-23), y
// en el inventario real NO hay ni una capacidad longitudinal declarada: éste es
// el único sitio donde este veredicto puede verse funcionar. Sembrar una
// capacidad en el fixture, en la base o en los datos de demostración «para poder
// verlo» sería publicar un «cumple» que nadie firmó, y ese error no deja rastro:
// se lee igual de bien que uno bueno.
// ════════════════════════════════════════════════════════════════════════════

describe('las negativas del eje longitudinal: dieciséis huecos, y ninguno mudo', () => {
  // LA LÍNEA DEL BLOQUE, con números redondos para que todo se compruebe en una
  // servilleta:
  //
  //     A ──────── B ──────── C ──────── D
  //   Terminal  Suspensión  Anclaje   Terminal
  //   └──────── tramo ────────┘└─ tramo ─┘
  //
  // Los dos tramos traen los mismos cuatro estados: 800 / 500 / 900 / 1.000 kgf.
  //
  // El apoyo que se examina es A, TERMINAL: soporta el tiro ENTERO, que es el
  // caso más severo del eje y donde un «cumple» falso es más caro.
  //
  //   envolvente permanente de A = el mayor de los cuatro = 1.000 kgf POR CONDUCTOR
  //   total sobre el apoyo       = 1.000 × 3 fases        = 3.000 kgf
  //
  // Lo que rompe un apoyo es el MOMENTO, no la fuerza: momento = fuerza × brazo.
  // Aquí el conductor amarra a 10 m y la capacidad está declarada a 10 m, así que
  // los dos brazos son el mismo y SE CANCELAN — la comparación queda en una
  // división que se hace de cabeza:
  //
  //   utilización = (3.000 × 10) / (12.000 × 10) = 3.000/12.000 = 25 %  → cumple
  //   margen      = 50 % · 12.000 − 3.000 = 6.000 − 3.000 = 3.000 kgf
  const CAPACIDAD = Object.freeze({
    valor_kgf: 12000, tipo: 'rotura', alturaReferencia_m: 10,
    fuente: 'ficha sintética de prueba',
  });
  const ALTURAS = Object.freeze({ alturaAplicacion_m: 10, alturaLibre_m: 12 });
  const DOTADO = Object.freeze({ capacidadLongitudinal: CAPACIDAD, ...ALTURAS });

  const T = (desde, hasta) => tramo(desde, hasta, { eds: 800, tMax: 500, viento: 900, tMin: 1000 });
  const TRAMOS = [T('A', 'C'), T('C', 'D')];
  const OPC = { rts_kgf: 6000, nFasesAmarradas: 3 };

  const linea = (extraA = {}, extraB = {}, extraC = {}) => [
    apoyo('A', 'Terminal', extraA),
    apoyo('B', 'Suspensión', { deflexion_grados: 2, ...extraB }),
    // Los dos tramos de C son idénticos en el modelo: su desequilibrio es CERO
    // EXACTO en los cuatro estados. Es el caso 12, y viene de serie.
    apoyo('C', 'Retención / anclaje', { deflexion_grados: 0, ...extraC }),
    apoyo('D', 'Terminal'),
  ];
  const correr = (apoyos, opciones = {}) =>
    longitudinalDeLaLinea(apoyos, TRAMOS, { ...OPC, ...opciones });
  /** La fila del terminal A, que es el apoyo bajo examen. */
  const filaA = (extraA = DOTADO, opciones = {}) => correr(linea(extraA), opciones)[0];
  const motivo = (fila) => fila.notas.join(' · ');

  /**
   * La misma comprobación a nivel de función, sin la línea de por medio.
   *
   * `conteoFasesDeLinea` va en true porque hoy la línea es el ÚNICO origen
   * posible del conteo (el contrato no lo tiene por apoyo) y la fila lo declara
   * en su criterio. Se replica aquí para que el control compare exactamente lo
   * que la fila publica: si esto y la fila divergen, la que miente es la prueba.
   */
  const solo = (cambios = {}) => utilizacionLongitudinal({
    fl_kgf: 3000, capacidad: CAPACIDAD, alturaAplicacion_m: 10, alturaLibre_m: 12,
    nFasesAmarradas: 3, conteoFasesDeLinea: true, ...cambios,
  });

  test('EL CONTROL: con todo declarado el veredicto SÍ sale, y es exactamente éste', () => {
    // Sin este control, cada negativa de abajo podría estar pasando por un
    // fixture roto en vez de por la negativa que dice probar: un `null` es la
    // respuesta más fácil de obtener por accidente que existe.
    const u = filaA().utilizacion;
    assert.equal(u.utilizacion_pct, 25);              // 3.000 / 12.000
    assert.equal(u.estado, 'cumple');
    assert.equal(u.umbralAplicado_pct, 50);
    assert.equal(u.margen_kgf, 3000);                 // 6.000 admisibles − 3.000
    assert.deepEqual(solo(), u, 'la fila publica lo que la función devuelve, sin retocarlo');
  });

  test('1 · nadie declaró la capacidad — el hueco que HOY tiene el 100 % del inventario', () => {
    // Si esta negativa fallara, el informe firmable publicaría un «cumple» contra
    // una capacidad que nadie declaró, y quien lo firma no tendría cómo saber de
    // dónde salió el número que está firmando.
    assert.equal(solo({ capacidad: undefined }), null);
    assert.equal(solo({ capacidad: null }), null);

    const a = filaA({ ...ALTURAS });
    assert.equal(a.utilizacion, null);
    // Un solo dueño de la frase: la fila publica LA constante exportada, no una
    // variante redactada aquí. Tres copias de un texto que envejece son tres
    // páginas que acaban contradiciéndose (ADR-014).
    assert.ok(a.notas.includes(SIN_CAPACIDAD_LONGITUDINAL));
    assert.match(motivo(a), /ensayo TRANSVERSAL en punta/);
    assert.match(motivo(a), /hueco del INVENTARIO, no un fallo del cálculo/);
  });

  test('2 · capacidad en cero, negativa o sin número: error de captura, NO ausencia', () => {
    // Si fallara, un cero se leería como un apoyo SIN NINGUNA resistencia y el
    // informe sacaría «revisar» sobre cualquier carga por pequeña que fuera —
    // mandando a reforzar apoyos sanos. Y un negativo daría una utilización
    // negativa con «cumple» al lado.
    for (const valor_kgf of [0, -12000, '12000', NaN, null, undefined]) {
      assert.equal(solo({ capacidad: { ...CAPACIDAD, valor_kgf } }), null,
        `valor_kgf = ${String(valor_kgf)} no es un dato`);
    }
    const a = filaA({ capacidadLongitudinal: { ...CAPACIDAD, valor_kgf: 0 }, ...ALTURAS });
    assert.equal(a.utilizacion, null);
    assert.match(motivo(a), /error de captura/);
    // Y NO se confunde con «no declarada»: son dos huecos distintos y se corrigen
    // en sitios distintos. Un solo motivo genérico mandaría a buscar el dato a
    // quien ya lo entregó, mal.
    assert.notEqual(motivo(a), motivo(filaA({ ...ALTURAS })));
  });

  test('3 · la capacidad no dice QUÉ es: sin tipo no hay contra qué comparar', () => {
    // Si fallara aplicando el 50 % por defecto, una capacidad que ya es ADMISIBLE
    // se partiría por la mitad una segunda vez y el informe sacaría del papel un
    // apoyo que cumple: «revisar» sobre una estructura sana, con obra detrás.
    for (const tipo of [undefined, null, '']) {
      assert.equal(solo({ capacidad: { ...CAPACIDAD, tipo } }), null);
    }
    const a = filaA({
      capacidadLongitudinal: { valor_kgf: 12000, alturaReferencia_m: 10 }, ...ALTURAS,
    });
    assert.equal(a.utilizacion, null);
    assert.match(motivo(a), /no dice QUÉ es/);
    assert.match(motivo(a), /coeficiente de seguridad 2 sobre la ROTURA/);
  });

  test('4 · un tipo fuera de las tres palabras del contrato NO se aproxima al más parecido', () => {
    // Si fallara «adivinando el más parecido», el informe elegiría entre el 50 % y
    // el 100 % por parecido ortográfico: un factor 2 sobre el veredicto de un
    // apoyo, decidido por un typo. La lista es CERRADA, no una coincidencia de
    // texto (`33 · L-19`).
    for (const tipo of ['ultima', 'nominal', 'ROTURA', 'diseño', 'rotura ', 'admisibles']) {
      assert.equal(solo({ capacidad: { ...CAPACIDAD, tipo } }), null,
        `«${tipo}» no es ninguno de los tres del contrato`);
    }
    const a = filaA({
      capacidadLongitudinal: { ...CAPACIDAD, tipo: 'ultima' }, ...ALTURAS,
    });
    assert.equal(a.utilizacion, null);
    assert.match(motivo(a), /no es ninguno de los tres/);
    // Y el motivo nombra los tres que sí, para que se corrija de una vez.
    for (const bueno of ['rotura', 'admisible', 'diseno']) {
      assert.match(motivo(a), new RegExp(bueno));
    }
  });

  test('5 · capacidad sin la altura a la que vale: no se supone que sea la punta', () => {
    // Si fallara suponiendo la punta —el convenio de `cargaRotura_kgf`, que SÍ
    // está definida como ensayo en la punta—, la capacidad se reescalaría en
    // silencio y el informe publicaría un porcentaje impecable y falso, con
    // veredicto encima. Una capacidad longitudinal se declara a una altura
    // concreta, normalmente el nivel de la cruceta.
    assert.equal(solo({ capacidad: { valor_kgf: 12000, tipo: 'rotura' } }), null);
    const a = filaA({
      capacidadLongitudinal: { valor_kgf: 12000, tipo: 'rotura' }, ...ALTURAS,
    });
    assert.equal(a.utilizacion, null);
    assert.match(motivo(a), /sin la altura a la que vale/);
    assert.match(motivo(a), /reescalarla en silencio/);
  });

  test('6 · falta la altura a la que el conductor amarra: kgf contra kgf no vale', () => {
    // Si fallara suponiendo que la carga actúa justo en la altura de referencia,
    // el informe regalaría o castigaría brazo sin que nada avise: con el amarre
    // 2 m por encima de la referencia, el mismo apoyo pasaría de «revisar» a
    // «cumple» sin que cambiara ni un dato del terreno.
    assert.equal(solo({ alturaAplicacion_m: undefined }), null);
    const a = filaA({ capacidadLongitudinal: CAPACIDAD, alturaLibre_m: 12 });
    assert.equal(a.utilizacion, null);
    assert.match(motivo(a), /falta la altura a la que el conductor amarra/);
    assert.match(motivo(a), /MOMENTO en el empotramiento/);
    assert.match(motivo(a), /hueco de CAPTURA, no de desarrollo/);
  });

  test('7 · el amarre queda por encima de la altura a la que la capacidad fue declarada', () => {
    // Dar el número exigiría extrapolar la capacidad HACIA ARRIBA. Si fallara, el
    // informe publicaría una capacidad inventada a una altura a la que nadie la
    // declaró — y encima con veredicto.
    assert.equal(solo({ alturaAplicacion_m: 11 }), null);   // 11 m > los 10 m de la referencia
    // Un milímetro por debajo sí da número: la guardia es el «por encima», no un
    // margen difuso. (3.000 × 9,999) / (12.000 × 10) ≈ 24,9975 %.
    cerca(solo({ alturaAplicacion_m: 9.999 }).utilizacion_pct, 24.9975, 1e-9, 'justo por debajo');

    const a = filaA({ capacidadLongitudinal: CAPACIDAD, alturaAplicacion_m: 11, alturaLibre_m: 12 });
    assert.equal(a.utilizacion, null);
    assert.match(motivo(a), /por encima de los 10\.00 m a los que la capacidad fue declarada/);
  });

  test('8 · el amarre queda por encima de la PUNTA del apoyo: geometría imposible', () => {
    // Si fallara, el informe firmable calcularía un momento sobre una geometría
    // que no existe. Es el mismo dato contradictorio que ya caza el eje
    // transversal, y el sistema tiene que decir LO MISMO del mismo apoyo en los
    // dos ejes: si un eje lo denuncia y el otro publica un porcentaje, la
    // discusión pasa a ser sobre quién programó qué.
    assert.equal(solo({ alturaAplicacion_m: 13 }), null);   // 13 m > la punta, 12 m
    const a = filaA({ capacidadLongitudinal: CAPACIDAD, alturaAplicacion_m: 13, alturaLibre_m: 12 });
    assert.equal(a.utilizacion, null);
    assert.match(motivo(a), /el punto de sujeción \(13\.00 m\) queda por encima de la punta del apoyo \(12\.00 m\)/);

    // La frase está DUPLICADA en `nucleo/cargas.js` (los dos módulos son
    // independientes por doctrina y ninguno importa del otro), así que lleva
    // guardián como cualquier otra cosa duplicada de este sistema.
    const COMPARTIDA = 'queda por encima de la punta del apoyo';
    for (const archivo of ['cargas.js', 'longitudinal.js']) {
      assert.ok(readFileSync(join(AQUI, '..', 'nucleo', archivo), 'utf-8').includes(COMPARTIDA),
        `${archivo} dejó de decirlo con las mismas palabras que el otro eje`);
    }
  });

  test('9 · la capacidad dice valer por encima de la punta: uno de los dos datos está mal', () => {
    // Es la única contradicción entre los tres datos de altura que ningún otro
    // chequeo caza. Si fallara, el informe publicaría un porcentaje BAJO —o sea,
    // favorable— calculado sobre una geometría que no existe: el error más
    // tranquilizador de todos.
    const alta = { ...CAPACIDAD, alturaReferencia_m: 13 };   // 13 m > la punta, 12 m
    assert.equal(solo({ capacidad: alta }), null);
    // Y se ve que el que se negó fue el chequeo de la PUNTA: sin punta declarada
    // el sistema no la inventa, y el mismo caso sí da número.
    assert.ok(solo({ capacidad: alta, alturaLibre_m: undefined }) !== null,
      'sin `alturaLibre_m` no se supone ninguna punta: se deja de comprobar, no se niega');

    const a = filaA({ capacidadLongitudinal: alta, ...ALTURAS });
    assert.equal(a.utilizacion, null);
    assert.match(motivo(a), /la capacidad dice estar referida a 13\.00 m, por encima de la punta/);
    assert.match(motivo(a), /el sistema no elige cuál/);
  });

  test('10 · sin saber cuántas fases amarran no hay TOTAL, y el veredicto va contra el total', () => {
    // El hueco que llega ANTES que la capacidad, y que hoy tienen todos los
    // apoyos: `nFasesAmarradas` no está en el contrato por apoyo.
    //
    // Si fallara comparando el valor POR CONDUCTOR, dividiría la carga entre 3 o 4.
    // Con una capacidad de 5.000 kgf: por conductor daría 1.000/5.000 = 20 % y
    // «cumple»; el total real es 3.000/5.000 = 60 % y «revisar». El «cumple» falso
    // más caro de este eje, y cae justo en los apoyos que llevan el tiro entero.
    const cap5k = { ...CAPACIDAD, valor_kgf: 5000 };
    const conConteo = filaA({ capacidadLongitudinal: cap5k, ...ALTURAS }).utilizacion;
    assert.equal(conConteo.utilizacion_pct, 60);     // (3.000 × 10) / (5.000 × 10)
    assert.equal(conConteo.estado, 'revisar');
    assert.equal(conConteo.margen_kgf, -500);        // 50 % · 5.000 = 2.500 − 3.000

    const sinConteo = filaA({ capacidadLongitudinal: cap5k, ...ALTURAS },
      { nFasesAmarradas: undefined });
    assert.equal(sinConteo.utilizacion, null, 'jamás el 20 % del valor por conductor');
    assert.match(motivo(sinConteo), /cuántas fases amarran/);
    // Y se dice por qué NO se hereda el conteo del otro eje, que es como alguien
    // «arreglaría» esto sin darse cuenta: la carga transversal cuenta 3·circuitos
    // con el cable de guarda declaradamente fuera — y aquí el guarda va más alto
    // y manda el momento.
    assert.match(motivo(sinConteo), /cable de guarda/);
    // A nivel de función: un total nulo no cae al valor por conductor, se niega.
    assert.equal(solo({ fl_kgf: null }), null);
  });

  test('11 · una fila que ya es no evaluable REMITE a su motivo, no lo reescribe', () => {
    // Hay un solo dueño de esa frase: el guardián que dejó la fila sin número.
    // Si fallara redactándolo otra vez con otras palabras, el mismo apoyo tendría
    // dos explicaciones distintas en el mismo informe — que es exactamente cómo
    // dos páginas del mismo papel acaban contradiciéndose (ADR-014).
    //
    // Se prueban los SIETE motivos del eje, y todos con la capacidad DECLARADA:
    // una capacidad no resucita una fila que no tiene carga que comparar.
    const casos = {
      'nombre de apoyo duplicado': [
        [apoyo('X', 'Terminal', DOTADO), apoyo('Y', 'Suspensión', { deflexion_grados: 1 }),
         apoyo('X', 'Retención / anclaje', { deflexion_grados: 20, ...DOTADO }),
         apoyo('Z', 'Terminal')],
        [T('X', 'Y'), T('Y', 'X'), T('X', 'Z')], 'X'],
      'sin funcionEstructural': [
        [apoyo('A', null, DOTADO), apoyo('B', 'Terminal')], [T('A', 'B')], 'A'],
      'Terminal en mitad de la línea': [
        [apoyo('A', 'Terminal'), apoyo('B', 'Terminal', { deflexion_grados: 5, ...DOTADO }),
         apoyo('C', 'Terminal')], [T('A', 'B'), T('B', 'C')], 'B'],
      'anclaje sin los DOS tramos identificados': [
        [apoyo('A', 'Terminal'), apoyo('B', 'Retención / anclaje', { deflexion_grados: 20, ...DOTADO }),
         apoyo('C', 'Terminal')], [T('A', 'B')], 'B'],
      'ángulo sin resolver': [
        [apoyo('A', 'Terminal'), apoyo('B', 'Retención / anclaje', DOTADO), apoyo('C', 'Terminal')],
        [T('A', 'B'), T('B', 'C')], 'B'],
      'Terminal con vano a los dos lados': [
        [apoyo('A', 'Terminal', { deflexion_grados: 10, ...DOTADO }),
         apoyo('B', 'Retención / anclaje', { deflexion_grados: 20 })],
        [T('X', 'A'), T('A', 'B')], 'A'],
      'tramo sin estados comparables': [
        [apoyo('A', 'Terminal', DOTADO), apoyo('B', 'Retención / anclaje', { deflexion_grados: 20 }),
         apoyo('C', 'Terminal')],
        [{ desde: { nombre: 'A' }, hasta: { nombre: 'B' } }, T('B', 'C')], 'A'],
    };

    for (const [nombre, [apoyos, tramos, quien]] of Object.entries(casos)) {
      const filas = longitudinalDeLaLinea(apoyos, tramos, OPC).filter((x) => x.apoyo === quien);
      // Sin esto, el día que una de estas líneas deje de producir la fila el
      // bucle no se ejecutaría y la prueba pasaría en verde sin comprobar nada:
      // el «verde que engaña» de manual.
      assert.equal(filas.length, nombre === 'nombre de apoyo duplicado' ? 2 : 1,
        `${nombre}: no salió la fila que esta prueba examina`);
      for (const fila of filas) {
        assert.equal(fila.caso, 'no_evaluable', nombre);
        assert.equal(fila.utilizacion, null, `${nombre}: la capacidad no resucita la fila`);
        const aviso = fila.notas.find((n) => /Sin veredicto en el eje longitudinal/.test(n));
        assert.match(aviso, /primero falta la carga longitudinal/, nombre);
        assert.ok(!aviso.includes(fila.noEvaluable),
          `${nombre}: el aviso repite el motivo en vez de remitir a él`);
      }
    }
  });

  test('12 · anclaje con desequilibrio CERO EXACTO: no hay número que dividir', () => {
    // Los dos tramos de C son idénticos EN EL MODELO, así que los cuatro estados
    // dan cero. Si esta negativa fallara, la fila publicaría «0 % · cumple» y
    // estaría certificando el apoyo con el cero DEL MODELO —que nace de que la
    // hipótesis declara un solo `eds_pct` para toda la línea—, no con una
    // medición. Un cero heredado de una hipótesis no certifica nada.
    const c = correr(linea({}, {}, DOTADO))[2];
    assert.equal(c.caso, 'no_evaluable');
    assert.equal(c.utilizacion, null);
    assert.match(motivo(c), /primero falta la carga longitudinal/);
    assert.ok(!/cumple|revisar/.test(motivo(c)), 'ni «cumple» ni «revisar» sobre un cero del modelo');
    assert.ok(!/0[.,]0+ ?%/.test(motivo(c)), 'no puede publicar un porcentaje que nadie calculó');
  });

  test('13 · una SUSPENSIÓN no recibe «cumple al 0 %», aunque traiga capacidad', () => {
    // Es el «cumple» más peligroso que este sistema podría emitir: certificaría,
    // con un número impecable, los apoyos sobre los que este módulo declara no
    // saber nada. El cero de una suspensión es del MODELO —dentro de un tramo de
    // tensión la tensión es común a los dos lados— y no cubre el tendido real, ni
    // el rozamiento de la grapa, ni la rotura de conductor, que es justamente lo
    // que carga longitudinalmente a un apoyo de suspensión.
    const b = correr(linea({}, DOTADO))[1];
    assert.equal(b.caso, 'suspension');
    assert.equal(b.permanente.fl_kgf, 0, 'el cero del modelo sí se publica: como cero declarado');
    assert.equal(b.utilizacion, null, 'pero no se convierte en veredicto');
    assert.ok(b.notas.includes(SIN_VEREDICTO_SUSPENSION));
    assert.match(motivo(b), /CERO DEL MODELO, no medido/);
    assert.match(motivo(b), /rotura de conductor/);
  });

  test('14 · el caso ACCIDENTAL nunca lleva veredicto, ni siquiera cuando es el mayor', () => {
    // Este proyecto NO ha adoptado criterio de aceptación para la rotura de
    // conductor, y las normas que la tratan aplican factores de carga propios que
    // no se pueden inventar aquí. Se publica la fuerza; el criterio lo pone quien
    // firma.
    //
    // El fixture está hecho para que el error se vea: el desequilibrio permanente
    // es pequeño y la rotura es enorme.
    //   permanente = (2.100 − 2.000)·cos(0°) = 100 kgf/conductor → 300 kgf totales
    //                (3.000 × 10) / (12.000 × 10)... no: (300 × 10)/(12.000 × 10) = 2,5 %
    //   accidental = pico del tramo SANO = 3.000 kgf/conductor
    // Si el accidental se colara en la comparación: 3.000 × 3 = 9.000 kgf, o sea
    // (9.000 × 10)/(12.000 × 10) = 75 %, y la fila diría «revisar» donde el caso
    // permanente va al 2,5 %. Se mandaría a reforzar una línea entera por una
    // hipótesis que el propio sistema declara no evaluar.
    const r = longitudinalDeLaLinea(
      [apoyo('A', 'Terminal'), apoyo('C', 'Retención / anclaje', { deflexion_grados: 0, ...DOTADO }),
       apoyo('D', 'Terminal')],
      [tramo('A', 'C', { eds: 2400, tMax: 2000, viento: 2700, tMin: 3000 }),
       tramo('C', 'D', { eds: 2400, tMax: 2100, viento: 2700, tMin: 3000 })],
      OPC,
    );
    const c = r[1];
    assert.equal(c.permanente.flAdelanteMax_kgf, 100);       // 2.100 − 2.000, en recta
    assert.equal(c.permanente.flTotalAdelante_kgf, 300);     // × 3 fases
    assert.equal(c.utilizacion.utilizacion_pct, 2.5);
    assert.equal(c.utilizacion.estado, 'cumple');

    assert.equal(c.accidental.atras.fuerza_kgf, 3000, 'el pico del tramo SANO, por conductor');
    const siHubieraEntrado = ((3 * c.accidental.atras.fuerza_kgf * 10) / (12000 * 10)) * 100;
    assert.equal(siHubieraEntrado, 75);
    assert.ok(siHubieraEntrado > UMBRAL_UTILIZACION_LONGITUDINAL_PCT,
      'el accidental habría dado «revisar»: por eso su ausencia se prueba, no se supone');

    // Y la estructura accidental no lleva NINGÚN campo que pueda leerse como
    // veredicto. Si alguien le añade uno mañana, esto se pone rojo antes de que
    // llegue al papel.
    for (const lado of ['atras', 'adelante']) {
      for (const campo of ['utilizacion', 'estado', 'veredicto', 'umbralAplicado_pct', 'margen_kgf']) {
        assert.ok(!(campo in c.accidental[lado]), `accidental.${lado} no puede traer «${campo}»`);
      }
      assert.match(c.accidental[lado].componentes.sinCriterio, /NO emite veredicto/);
    }
    assert.ok(!/cumple|revisar/.test(JSON.stringify(c.accidental)));
    // El texto del veredicto lo dice, además, en el propio informe.
    assert.match(c.utilizacion.criterio, /El caso ACCIDENTAL \(rotura de conductor\) NO entra/);
  });

  test('15 · una capacidad pasada como valor de LÍNEA se ignora, y no deja rastro de veredicto', () => {
    // Si fallara, un apoyo heredaría el veredicto de otro en una línea donde
    // conviven concreto, metálico, madera, torre y torreta — y el informe firmaría
    // «cumple» sobre estructuras que nadie evaluó. Un veredicto heredado es peor
    // que no tener veredicto: no se distingue de uno bueno.
    const r = correr(linea({ ...ALTURAS }, ALTURAS, ALTURAS), {
      capacidadLongitudinal: CAPACIDAD,          // por si alguien lo intenta así
      capacidad: CAPACIDAD,                      // …o así
      cargaRotura_kgf: 12000,                    // …o con el dato del otro eje
    });
    for (const fila of r) {
      assert.equal(fila.utilizacion, null, `${fila.apoyo} no hereda capacidad de la línea`);
    }
    assert.ok(r[0].notas.includes(SIN_CAPACIDAD_LONGITUDINAL),
      'y la fila sigue diciendo que falta la capacidad DEL APOYO');
  });

  test('16 · `cargaRotura_kgf` no alimenta este eje, y no se lee en ningún punto', () => {
    // Si fallara, el sistema confundiría un ensayo TRANSVERSAL en punta con una
    // capacidad a lo largo de la línea. Los dos errores caben en el mismo número:
    // «revisar» sobre un terminal retenido sano y «cumple» sobre un poste con el
    // eje débil hacia la línea. La validez de ese ensayo en este eje depende de la
    // sección del apoyo y de si hay retenida, y el contrato no declara ninguna.
    const a = filaA({ cargaRotura_kgf: 12000, ...ALTURAS });   // todo lo del otro eje, completo
    assert.equal(a.utilizacion, null);
    assert.ok(a.notas.includes(SIN_CAPACIDAD_LONGITUDINAL));

    // Guardián de código: el módulo no lee ese campo en ninguna rama. Las
    // menciones que tiene son de prosa (van entre acentos graves, para el
    // informe); una lectura de verdad se escribe con un punto delante.
    const fuente = readFileSync(join(AQUI, '..', 'nucleo', 'longitudinal.js'), 'utf-8');
    assert.ok(!/\.cargaRotura_kgf/.test(fuente),
      'alguien conectó la carga de rotura transversal al eje longitudinal');
    assert.ok(!/\[\s*['"]cargaRotura_kgf/.test(fuente));
  });

  test('HOY: sin capacidad en ningún apoyo, las cuatro filas dicen POR QUÉ, una sola vez', () => {
    // Es lo que este trabajo entrega de verdad, y hay que decirlo con esas
    // palabras: las filas siguen sin veredicto — pero por el motivo VERDADERO y
    // ESCRITO, no con un `null` mudo que en la pantalla se lee como un guion y en
    // el papel como un olvido. El día que el inventario traiga el dato, el
    // veredicto sale solo.
    const r = correr(linea());
    assert.deepEqual(r.map((x) => x.caso),
      ['terminal', 'suspension', 'no_evaluable', 'terminal']);
    for (const fila of r) {
      assert.equal(fila.utilizacion, null);
      const avisos = fila.notas.filter((n) => n.startsWith('Sin veredicto en el eje longitudinal:'));
      assert.equal(avisos.length, 1,
        `${fila.apoyo}: un hueco, un motivo — ni mudo ni repetido con otras palabras`);
    }
  });

  test('…y cuando SÍ hay veredicto, ninguna fila sigue afirmando que no lo hay', () => {
    // El fallo que ADR-014 tuvo que arreglar en cinco sitios: un texto fijo que
    // afirma «ningún apoyo tiene veredicto» sobreviviendo al día en que uno lo
    // tiene, y contradiciendo a la tabla que está justo encima.
    const a = filaA();
    assert.ok(a.utilizacion);
    assert.ok(!a.notas.some((n) => /Sin veredicto en el eje longitudinal/.test(n)));
  });
});

describe('el umbral: cuál manda, dónde está su borde y qué declara el papel', () => {
  const CAP = Object.freeze({ valor_kgf: 12000, alturaReferencia_m: 10 });
  /** Brazos iguales (10 m y 10 m): el momento se cancela y queda la división. */
  const con = (tipo, fl_kgf) => utilizacionLongitudinal({
    fl_kgf, capacidad: { ...CAP, tipo }, alturaAplicacion_m: 10, nFasesAmarradas: 3,
  });

  test('EL TIPO manda, y el umbral que se aplicó es el de la constante, no un 50 escrito a mano', () => {
    // Si el número se escribiera suelto en la fórmula, cambiar la constante
    // dejaría el informe imprimiendo un criterio que el cálculo ya no usa.
    assert.equal(con('rotura', 3000).umbralAplicado_pct, UMBRAL_UTILIZACION_LONGITUDINAL_PCT);
    assert.equal(con('admisible', 3000).umbralAplicado_pct,
      UMBRAL_UTILIZACION_LONGITUDINAL_DECLARADA_PCT);
    assert.equal(con('diseno', 3000).umbralAplicado_pct,
      UMBRAL_UTILIZACION_LONGITUDINAL_DECLARADA_PCT);
    assert.equal(UMBRAL_UTILIZACION_LONGITUDINAL_PCT, 50);
    assert.equal(UMBRAL_UTILIZACION_LONGITUDINAL_DECLARADA_PCT, 100);
  });

  test('EL BORDE: justo EN el umbral se cumple; el criterio es superarlo', () => {
    // Misma doctrina que el eje transversal (`cargas.js`), y a propósito: el mismo
    // apoyo no puede estar «al límite» en una tabla y «pasado» en la otra por una
    // desigualdad escrita distinta. En el borde el margen es CERO EXACTO, que es
    // el único número honesto ahí.
    //
    // Rotura, 50 % de 12.000 = 6.000 kgf admisibles a la misma altura.
    assert.equal(con('rotura', 6000).utilizacion_pct, 50);
    assert.equal(con('rotura', 6000).estado, 'cumple');
    assert.equal(con('rotura', 6000).margen_kgf, 0);
    // 6.060 kgf = 50,5 % → revisar, y 60 kgf de déficit.
    assert.equal(con('rotura', 6060).utilizacion_pct, 50.5);
    assert.equal(con('rotura', 6060).estado, 'revisar');
    assert.equal(con('rotura', 6060).margen_kgf, -60);

    // Admisible: el listón está en el 100 %, y el borde se comporta igual.
    assert.equal(con('admisible', 12000).utilizacion_pct, 100);
    assert.equal(con('admisible', 12000).estado, 'cumple');
    assert.equal(con('admisible', 12000).margen_kgf, 0);
    assert.equal(con('admisible', 12120).estado, 'revisar');   // 101 %
    assert.equal(con('admisible', 12120).margen_kgf, -120);
  });

  test('el factor 2 entre los dos umbrales, visto sobre el mismo apoyo', () => {
    // 9.000 kgf sobre 12.000 = 75 %. Con una capacidad de ROTURA eso es «revisar»
    // (el margen ya está comido); con una ADMISIBLE es «cumple», porque ese número
    // ya venía con su factor de seguridad dentro. Confundirlos no es un matiz: es
    // un apoyo que sale al informe en rojo o en verde según una palabra.
    assert.equal(con('rotura', 9000).utilizacion_pct, 75);
    assert.equal(con('admisible', 9000).utilizacion_pct, 75);
    assert.equal(con('rotura', 9000).estado, 'revisar');
    assert.equal(con('admisible', 9000).estado, 'cumple');
    // Y el margen sigue al umbral APLICADO, nunca al 50 fijo. Si no, la misma
    // fila publicaría «cumple» con un margen NEGATIVO al lado, y la discusión
    // pasaría a ser sobre quién programó qué.
    assert.equal(con('rotura', 9000).margen_kgf, -3000);       // 6.000 − 9.000
    assert.equal(con('admisible', 9000).margen_kgf, 3000);     // 12.000 − 9.000
    assert.ok(con('admisible', 9000).margen_kgf > 0, 'ningún «cumple» con margen negativo');
  });

  test('el criterio de cada fila explica de dónde sale SU umbral, no el del otro', () => {
    // Va al informe firmable: quien revisa tiene que poder discutir el número
    // —qué capacidad, de qué tipo, a qué altura, de dónde salió y contra qué
    // porcentaje— sin abrir el código.
    assert.match(con('rotura', 3000).criterio, /coeficiente de seguridad 2/);
    assert.match(con('admisible', 3000).criterio, /ya lleva su factor de seguridad DENTRO/);
    assert.match(con('admisible', 3000).criterio, /no es laxitud/);
    assert.match(con('diseno', 3000).criterio, /ya lleva su factor de seguridad DENTRO/);
    assert.ok(!/coeficiente de seguridad 2/.test(con('admisible', 3000).criterio),
      'una capacidad admisible no puede llevar impresa la justificación del 50 %');
  });

  test('el criterio declara los supuestos que el porcentaje arrastra', () => {
    // Un porcentaje que no declara sus supuestos aparenta más precisión de la que
    // tiene. Dos viajan siempre: que los n conductores amarran a la MISMA altura
    // (el sistema no tiene la altura por conductor) y de dónde salió el conteo de
    // fases, que hoy solo puede venir de la LÍNEA porque el contrato no lo tiene
    // por apoyo.
    const r = utilizacionLongitudinal({
      fl_kgf: 3000, capacidad: { ...CAP, tipo: 'rotura' },
      alturaAplicacion_m: 10, nFasesAmarradas: 3, conteoFasesDeLinea: true,
    });
    assert.match(r.criterio, /TODOS A LA MISMA ALTURA/);
    assert.match(r.criterio, /se tomó de la LÍNEA, no del apoyo/);

    // Con UN solo conductor ese supuesto no existe, y el texto no lo finge.
    const uno = utilizacionLongitudinal({
      fl_kgf: 1000, capacidad: { ...CAP, tipo: 'rotura' },
      alturaAplicacion_m: 10, nFasesAmarradas: 1,
    });
    assert.ok(!/SUPUESTO HEREDADO/.test(uno.criterio));
    assert.match(uno.criterio, /UN solo conductor/);
  });

  test('el criterio del módulo YA NO afirma que solo se aplica a capacidades de rotura', () => {
    // Ese texto era verdad con media especificación y se volvió FALSO al entrar
    // los otros dos tipos. Se imprime en el informe firmable: si sobrevive, el
    // papel se contradice con su propia tabla dos páginas después — el fallo que
    // ADR-014 tuvo que arreglar en cinco sitios.
    assert.ok(!/Solo se aplica a capacidades de tipo/.test(CRITERIO_UTILIZACION_LONGITUDINAL));
    assert.match(CRITERIO_UTILIZACION_LONGITUDINAL, /50 %/);
    assert.match(CRITERIO_UTILIZACION_LONGITUDINAL, /100 %/);
    for (const tipo of ['rotura', 'admisible', 'diseno']) {
      assert.match(CRITERIO_UTILIZACION_LONGITUDINAL, new RegExp(tipo));
    }
    assert.match(CRITERIO_UTILIZACION_LONGITUDINAL, /ACCIDENTAL/);
    // Y declara que sin tipo no hay veredicto, que es la mitad que faltaba.
    assert.match(CRITERIO_UTILIZACION_LONGITUDINAL, /Sin tipo declarado NO hay veredicto/);
  });

  test('entradas basura no producen un número: null, y sin explotar', () => {
    // Un veredicto es lo último que puede salir de un dato que nadie entendió.
    for (const malo of [null, undefined, {}, { fl_kgf: 3000 }, { capacidad: CAP },
      { fl_kgf: '3000', capacidad: { ...CAP, tipo: 'rotura' }, alturaAplicacion_m: 10 },
      { fl_kgf: NaN, capacidad: { ...CAP, tipo: 'rotura' }, alturaAplicacion_m: 10 },
      { fl_kgf: Infinity, capacidad: { ...CAP, tipo: 'rotura' }, alturaAplicacion_m: 10 },
      { fl_kgf: 3000, capacidad: 'rotura 12000', alturaAplicacion_m: 10 },
      { fl_kgf: 3000, capacidad: [{ ...CAP, tipo: 'rotura' }], alturaAplicacion_m: 10 }]) {
      assert.equal(utilizacionLongitudinal(malo), null, `entrada: ${JSON.stringify(malo)}`);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Lo que el integrador tuvo que arreglar A MANO después del workflow (§ADR-017).
// Un agente murió a mitad de la fase de presentación y dejó el eje ENTERO como
// código muerto en el producto: la función existía, las pruebas la llamaban
// directamente… y el camino real de la aplicación no podía alcanzarla nunca.
// Es la segunda vez que este proyecto comete `30 · L-28`, y la primera en que
// una prueba lo habría cazado. Estas son esas pruebas.
// ════════════════════════════════════════════════════════════════════════════
describe('el veredicto tiene que llegar por el camino REAL de la aplicación', () => {
  const CAP = { valor_kgf: 20000, tipo: 'rotura', alturaReferencia_m: 12, fuente: 'ficha sintética' };
  const conTodo = (nombre, funcion, extra = {}) => apoyo(nombre, funcion, {
    alturaAplicacion_m: 12, alturaLibre_m: 14, deflexion_grados: 40,
    capacidadLongitudinal: CAP, ...extra,
  });
  const TRAMOS_V = [
    tramo('A', 'C', { eds: 1200, tMax: 700, viento: 1230, tMin: 1500 }),
    tramo('C', 'D', { eds: 1200, tMax: 1000, viento: 1255, tMin: 1290 }),
  ];
  const de = (r, n) => r.find((x) => x.apoyo === n);

  test('con el conteo de fases EN EL APOYO, el veredicto sale sin pasarlo por opciones', () => {
    // EL FALLO: `longitudinalParaPantalla` —la única puerta de entrada de la
    // pantalla, el CSV y el informe— llama al núcleo solo con `rts_kgf`. Si el
    // conteo únicamente pudiera entrar por `opciones`, el veredicto sería
    // inalcanzable en producción por muy bien declarada que estuviera la
    // capacidad. Se lee del APOYO, igual que `cargas.js` hace con `nConductores`.
    const apoyos = [
      conTodo('A', 'Terminal', { nFasesAmarradas: 3 }),
      conTodo('C', 'Retención / anclaje', { nFasesAmarradas: 3 }),
      conTodo('D', 'Terminal', { nFasesAmarradas: 3 }),
    ];
    const r = longitudinalDeLaLinea(apoyos, TRAMOS_V, { rts_kgf: 6000 });   // ← SIN nFasesAmarradas
    assert.ok(de(r, 'A').utilizacion, 'sin esto, todo el eje es código muerto en producción');
    assert.equal(de(r, 'A').utilizacion.estado, 'cumple');
  });

  test('el apoyo MANDA sobre la línea: un terminal amarra todo y uno de paso puede no amarrar nada', () => {
    const apoyos = [
      conTodo('A', 'Terminal', { nFasesAmarradas: 6 }),   // el doble que la línea
      conTodo('C', 'Retención / anclaje'),                // sin declarar: hereda la línea
      conTodo('D', 'Terminal'),
    ];
    const r = longitudinalDeLaLinea(apoyos, TRAMOS_V, { rts_kgf: 6000, nFasesAmarradas: 3 });
    // A usa 6 → su total es el doble que con 3, y su porcentaje también.
    assert.equal(de(r, 'A').nFasesAmarradas, 6);
    assert.equal(de(r, 'C').nFasesAmarradas, 3, 'sin dato propio, hereda el de la línea');
    // Y cuando lo hereda, el criterio lo DICE: un conteo de línea es una
    // suposición sobre cada estructura y quien firma tiene que saberlo.
    assert.match(de(r, 'C').utilizacion.criterio, /se tomó de la LÍNEA, no del apoyo/);
    assert.doesNotMatch(de(r, 'A').utilizacion.criterio, /se tomó de la LÍNEA/);
  });

  test('el porcentaje se puede comprobar con una calculadora: el numerador va publicado', () => {
    // Las columnas «adelante» y «atrás» son POR CONDUCTOR y la utilización se
    // calcula sobre el TOTAL. Sin publicar el total, quien revise el informe
    // obtiene un tercio de lo impreso y concluye que el cálculo está mal — que
    // es justo lo contrario de «hacer barato comprobar que tiene razón».
    const apoyos = [conTodo('A', 'Terminal', { nFasesAmarradas: 3 }),
      conTodo('C', 'Retención / anclaje', { nFasesAmarradas: 3 }),
      conTodo('D', 'Terminal', { nFasesAmarradas: 3 })];
    const f = de(longitudinalDeLaLinea(apoyos, TRAMOS_V, { rts_kgf: 6000 }), 'A');
    assert.ok(Number.isFinite(f.flTotalPeor_kgf), 'el numerador tiene que viajar en la fila');
    // momento = fuerza × brazo, y con las dos alturas iguales el brazo se cancela:
    //   utilización = total / capacidad = 4500 / 20000 = 22,5 %
    cerca(f.flTotalPeor_kgf * 12 / (CAP.valor_kgf * 12) * 100, f.utilizacion.utilizacion_pct, 1e-9,
      'el porcentaje publicado no se reproduce con los números publicados');
  });

  test('un apoyo de DERIVACIÓN no recibe veredicto: nadie ve el tiro de su ramal', () => {
    // Antes de §ADR-017 esa fila publicaba un «cumple» verde. La cifra que sale
    // es el desequilibrio entre los DOS tramos de la línea principal; lo que de
    // verdad carga a un apoyo de derivación es el tercer tiro, el del ramal, y
    // el sistema no lo ve. Misma doctrina que la suspensión: antes sin dictamen
    // que con uno indefendible.
    const apoyos = [conTodo('A', 'Terminal', { nFasesAmarradas: 3 }),
      conTodo('C', 'Derivación', { nFasesAmarradas: 3 }),
      conTodo('D', 'Terminal', { nFasesAmarradas: 3 })];
    const f = de(longitudinalDeLaLinea(apoyos, TRAMOS_V, { rts_kgf: 6000 }), 'C');
    assert.equal(f.utilizacion, null, 'un «cumple» aquí afirma que aguanta una carga no mirada');
    assert.ok(Number.isFinite(f.flTotalPeor_kgf), 'pero la parte que SÍ se calcula se publica');
    assert.ok(f.notas.some((n) => /ramal/i.test(n)),
      'y la negativa no puede ser muda: tiene que decir que falta el ramal');
  });

  test('«declara capacidad» y «lleva veredicto» son dos hechos distintos, y se publican aparte', () => {
    // Confundirlos hace que el informe firmable afirme que el inventario no
    // tiene el dato cuando sí lo tiene, y mande a corregir el sitio equivocado.
    const apoyos = [conTodo('A', 'Terminal'), conTodo('C', 'Retención / anclaje'), conTodo('D', 'Terminal')];
    const r = longitudinalDeLaLinea(apoyos, TRAMOS_V, { rts_kgf: 6000 });   // sin conteo: sin veredicto
    assert.ok(r.every((x) => x.capacidadDeclarada === true), 'los tres declaran su capacidad');
    assert.ok(r.every((x) => x.utilizacion === null), 'y ninguno lleva veredicto: falta el conteo');
    const motivo = r[0].notas.find((n) => /Sin veredicto/.test(n));
    assert.match(motivo, /fases/i, 'el motivo tiene que señalar el conteo…');
    assert.doesNotMatch(motivo, /nadie ha declarado la capacidad/,
      '…y NO la capacidad, que sí está declarada: mandaría a arreglar donde no está el hueco');
  });
});
