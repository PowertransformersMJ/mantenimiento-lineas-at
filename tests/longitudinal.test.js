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
  UMBRAL_UTILIZACION_LONGITUDINAL_PCT,
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
    // Aplicar el 50 % a una capacidad ya admisible la parte por la mitad dos
    // veces y saca del papel un apoyo que cumple.
    assert.equal(utilizacionLongitudinal({
      fl_kgf: 2000, capacidad: { valor_kgf: 8000, alturaReferencia_m: 12 }, alturaAplicacion_m: 12,
    }), null);
    assert.equal(utilizacionLongitudinal({
      fl_kgf: 2000, capacidad: { ...cap, tipo: 'admisible' }, alturaAplicacion_m: 12,
    }), null);
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
