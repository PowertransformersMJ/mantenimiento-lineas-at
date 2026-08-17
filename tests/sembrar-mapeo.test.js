// ============================================================================
// tests/sembrar-mapeo.test.js — LA PRUEBA MADRE: insertar un punto no puede
// mover el id de ningún punto que ya existe
// ----------------------------------------------------------------------------
// EL DAÑO QUE EVITA, en concreto. El levantamiento de julio son 26 puntos ya
// escritos en producción, y de sus ids cuelgan 99 fotos y el expediente de la
// falla. Con la identidad atada a la POSICIÓN, meter un punto en medio —el
// empalme que apareció el 11 de agosto dentro del vano E03→E04— reescribía el id
// de los 23 que van detrás. Y no da error: las fotos se quedan huérfanas, el
// expediente apunta al vacío y la pantalla dice «no identificada».
//
// El día que se cargue el pórtico del extremo de ORIGEN —que va ANTES de E01—
// se correrían los 26 de golpe.
//
// EL MUNDO DE ESTA PRUEBA ES SINTÉTICO, como manda el patrón del repositorio:
// cada archivo de pruebas fabrica el suyo y no hay ayudantes compartidos. Las
// coordenadas son inventadas (lat/lon en torno a 1, que no es ningún sitio de
// esta línea) y no se lee la bóveda. Los NOMBRES canónicos y los ids sí son los
// reales: son públicos —ya estaban en el sembrador— y son justo lo que hay que
// fijar.
//
// Se prueba `construirApoyos`, que es la lógica pura fixture→documentos. Antes
// vivía dentro de `sembrar.mjs` y era IMPOSIBLE de probar: aquel script aborta
// nada más cargarse si no encuentra credencial de administrador.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { construirApoyos, construirInvestigacion, FUNCIONES } from '../herramientas/construir-apoyos.mjs';
import { CANONICOS, idEstable, idDePunto, leerRegistro } from '../herramientas/identidad.mjs';

const LINEA = 'LN-627';
const AHORA = '2026-08-16T00:00:00.000Z';
const REGISTRO = leerRegistro();

/**
 * Los 26 puntos del levantamiento base, con coordenadas INVENTADAS y con los
 * nombres de campo TAL COMO el GPS los grabó — errores incluidos, que es
 * precisamente lo que hay que probar que no contamina la identidad.
 */
const nombreDeCampoSintetico = (i) => {
  if (i === 1) return 'LN 627 E022';      // el GPS escribió E022 donde la línea tiene su E02
  if (i === 8) return 'E02';              // …y escribió E02 donde la línea tiene su E07
  if (i === 5) return '627 EMP TUB';
  if (i === 7) return 'EMPT';
  return `LN 627 P${i}`;
};

const puntosJulio = () => CANONICOS[LINEA].map((_, i) => ({
  name: nombreDeCampoSintetico(i),
  lat: 1 + i * 0.001,
  lon: 1 + i * 0.001,
  ele: 10 + i,
  utc: '2026-07-25T12:00:00.000Z',
}));

/** El empalme del 11 de agosto: cae DENTRO del vano E03→E04. */
const EMPALME_NUEVO = {
  name: 'GPS EMP N',
  rol: 'empalme',
  estado: 'aprobado',
  nombreCanonico: 'LN-627 EMP E03-E04',
  funcionEstructural: 'Suspensión',
  insertarDespuesDe: 'LN-627 E03',
  lat: 1.5, lon: 1.5, ele: 7,
  utc: '2026-08-11T12:00:00.000Z',
};

/** El pórtico del extremo de FIN: apoyo real, va detrás de E24. */
const PORTICO_FIN = {
  name: 'GPS PRT F',
  rol: 'portico_subestacion',
  estado: 'aprobado',
  nombreCanonico: 'LN-627 PORTICO FIN',
  funcionEstructural: 'Terminal',
  insertarAlFinal: true,
  lat: 1.6, lon: 1.6, ele: 4,
  utc: '2026-08-12T12:00:00.000Z',
};

/**
 * El pórtico del extremo de ORIGEN. El Ingeniero ordenó NO cargarlo hasta
 * verificarlo: queda PENDIENTE, no descartado, y no se borra del fixture.
 */
const PORTICO_ORIGEN_PENDIENTE = {
  name: 'GPS PRT O',
  rol: 'portico_subestacion',
  estado: 'pendiente_verificacion',
  nombreCanonico: 'LN-627 PORTICO ORIGEN',
  funcionEstructural: 'Terminal',
  motivoPendiente: 'el Ingeniero quiere verificarlo antes de cargarlo',
  insertarDespuesDe: null,
  lat: 1.7, lon: 1.7, ele: 3,
  utc: '2026-08-12T12:30:00.000Z',
};

const construir = (ampliacion = []) =>
  construirApoyos(LINEA, puntosJulio(), ampliacion, { ahora: AHORA, registro: REGISTRO });

const porNombre = (apoyos) => new Map(apoyos.map((a) => [a.nombreNormalizado, a]));

// ════════════════════════════════════════════════════════════════════════════
describe('LA PRUEBA MADRE — un punto nuevo en medio no mueve el id de nadie', () => {

  test('los 26 ids son IDÉNTICOS antes y después de intercalar el empalme', () => {
    const antes = porNombre(construir().apoyos);
    const despues = porNombre(construir([EMPALME_NUEVO, PORTICO_FIN]).apoyos);

    const movidos = [];
    for (const [nombre, a] of antes) {
      if (despues.get(nombre).id !== a.id) movidos.push(nombre);
    }
    assert.deepEqual(movidos, [],
      'insertar un punto movió el id de puntos ya sembrados. De cada uno de esos ids cuelgan fotos y, de E02, el expediente de la falla.');
  });

  test('EL DAÑO QUE SE EVITA: con la identidad atada a la posición, se moverían 23 de 26', () => {
    // Se reconstruye aquí la fórmula VIEJA —`idEstable('apoyo-' + i)` sobre el
    // índice del array— para dejar por escrito por qué esto no es una
    // precaución teórica. Insertar en la posición 3 desplaza a los 23 que van
    // detrás, y cada uno recibe el id que antes era de otro.
    const viejo = (lista) => lista.map((_, i) => idEstable('transpower', LINEA, `apoyo-${i}`));

    const conElEmpalme = [...CANONICOS[LINEA].slice(0, 3), 'LN-627 EMP E03-E04', ...CANONICOS[LINEA].slice(3)];
    const idViejoDe = new Map(CANONICOS[LINEA].map((n, i) => [n, viejo(CANONICOS[LINEA])[i]]));
    const idNuevoDe = new Map(conElEmpalme.map((n, i) => [n, viejo(conElEmpalme)[i]]));

    const cambian = CANONICOS[LINEA].filter((n) => idNuevoDe.get(n) !== idViejoDe.get(n));
    assert.equal(cambian.length, 23,
      'esta cifra es el tamaño del daño de la fórmula vieja: 23 apoyos de 26 con id nuevo y sus fotos huérfanas, sin un solo error');
    assert.deepEqual(cambian.slice(0, 2), ['LN-627 E04', 'LN-627 E05']);

    // Y lo grave no es que el id «cambie»: es que 22 de esos apoyos se quedan
    // con el id que pertenecía a su vecino. Las fotos no se pierden — se
    // recuelgan del apoyo equivocado, que se lee como evidencia de algo que no
    // ocurrió ahí.
    const idsViejos = new Set(idViejoDe.values());
    assert.equal(cambian.filter((n) => idsViejos.has(idNuevoDe.get(n))).length, 22,
      '22 apoyos heredarían el id —y las fotos— de otro apoyo');

    // Y lo que importa: con la fórmula de HOY no se mueve ninguno.
    const hoyAntes = porNombre(construir().apoyos);
    const hoyDespues = porNombre(construir([EMPALME_NUEVO]).apoyos);
    assert.deepEqual(CANONICOS[LINEA].filter((n) => hoyAntes.get(n).id !== hoyDespues.get(n).id), []);
  });

  test('la regla vale para cualquier línea, no solo por casualidad para ésta', () => {
    // Mundo enteramente sintético: línea inventada, registro inventado, semillas
    // inventadas. Insertar al principio, en medio y al final; nadie se mueve.
    const canonicos = ['LX-1 A', 'LX-1 B', 'LX-1 C', 'LX-1 D'];
    const registro = { 'LX-1': Object.fromEntries(canonicos.map((n, i) => [n, { semilla: `apoyo-${i}`, id: idEstable('transpower', 'LX-1', `apoyo-${i}`) }])) };
    const base = canonicos.map((_, i) => ({ name: `campo ${i}`, lat: 1 + i, lon: 1 + i, ele: 1, utc: AHORA }));
    const opciones = { ahora: AHORA, registro, canonicos };

    const antes = porNombre(construirApoyos('LX-1', base, [], opciones).apoyos);
    const nuevos = [
      { name: 'x', rol: 'empalme', estado: 'aprobado', nombreCanonico: 'LX-1 A-B', funcionEstructural: 'Suspensión', insertarDespuesDe: 'LX-1 A', lat: 1, lon: 1, ele: 1, utc: AHORA },
      { name: 'y', rol: 'empalme', estado: 'aprobado', nombreCanonico: 'LX-1 C-D', funcionEstructural: 'Suspensión', insertarDespuesDe: 'LX-1 C', lat: 1, lon: 1, ele: 1, utc: AHORA },
      { name: 'z', rol: 'portico_subestacion', estado: 'aprobado', nombreCanonico: 'LX-1 FIN', funcionEstructural: 'Terminal', insertarAlFinal: true, lat: 1, lon: 1, ele: 1, utc: AHORA },
    ];
    const despues = porNombre(construirApoyos('LX-1', base, nuevos, opciones).apoyos);

    for (const [nombre, a] of antes) assert.equal(despues.get(nombre).id, a.id, `«${nombre}» se movió`);
    assert.equal(despues.size, 7);
  });

  test('reconstruir dos veces da exactamente los mismos ids (idempotencia)', () => {
    const a = construir([EMPALME_NUEVO, PORTICO_FIN]).apoyos.map((x) => x.id);
    const b = construir([EMPALME_NUEVO, PORTICO_FIN]).apoyos.map((x) => x.id);
    assert.deepEqual(a, b);
  });

  test('el orden en que llegan los puntos nuevos no cambia ningún id', () => {
    const enUnOrden = porNombre(construir([EMPALME_NUEVO, PORTICO_FIN]).apoyos);
    const enElOtro = porNombre(construir([PORTICO_FIN, EMPALME_NUEVO]).apoyos);
    for (const [nombre, a] of enUnOrden) assert.equal(enElOtro.get(nombre).id, a.id);
  });

  test('ningún id se repite ni en los 26 ni en los 28', () => {
    for (const amp of [[], [EMPALME_NUEVO, PORTICO_FIN]]) {
      const ids = construir(amp).apoyos.map((a) => a.id);
      assert.equal(new Set(ids).size, ids.length, 'dos apoyos compartiendo id compartirían fotos y expediente');
    }
    assert.deepEqual(construir([EMPALME_NUEVO, PORTICO_FIN]).colisiones, []);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('EL ORDEN SE BISECA — nadie renumera a nadie', () => {

  test('los 26 de julio conservan orden 0…25, exactos', () => {
    for (const amp of [[], [EMPALME_NUEVO, PORTICO_FIN]]) {
      const mapa = porNombre(construir(amp).apoyos);
      CANONICOS[LINEA].forEach((nombre, i) => {
        assert.equal(mapa.get(nombre).orden, i,
          `«${nombre}» cambió de orden. Renumerar obliga a reescribir 26 documentos de producción para registrar un hecho que no cambió, y mueve las fotos, que se resuelven por este mismo campo.`);
      });
    }
  });

  test('el empalme intercalado recibe (2+3)/2 = 2,5 — y 2,5 es exacto en IEEE-754', () => {
    const mapa = porNombre(construir([EMPALME_NUEVO]).apoyos);
    assert.equal(mapa.get('LN-627 EMP E03-E04').orden, 2.5);
    assert.equal(mapa.get('LN-627 E03').orden, 2);
    assert.equal(mapa.get('LN-627 E04').orden, 3);
    assert.equal((2 + 3) / 2, 2.5);
  });

  test('el pórtico va al final: último + 1 = 26', () => {
    assert.equal(porNombre(construir([PORTICO_FIN]).apoyos).get('LN-627 PORTICO FIN').orden, 26);
  });

  test('la secuencia queda E01 E02 E03 [EMP E03-E04] E04 … E24 [PORTICO FIN]', () => {
    const secuencia = construir([EMPALME_NUEVO, PORTICO_FIN]).apoyos.map((a) => a.nombreNormalizado);
    assert.equal(secuencia.length, 28);
    assert.deepEqual(secuencia.slice(0, 6), [
      'LN-627 E01', 'LN-627 E02', 'LN-627 E03', 'LN-627 EMP E03-E04', 'LN-627 E04', 'LN-627 E05',
    ]);
    assert.deepEqual(secuencia.slice(-2), ['LN-627 E24', 'LN-627 PORTICO FIN']);
    // La posición en la secuencia ES el dato: de ella deducen el vano del
    // empalme tanto la exportación como la ficha de la aplicación.
    const ordenes = construir([EMPALME_NUEVO, PORTICO_FIN]).apoyos.map((a) => a.orden);
    assert.deepEqual(ordenes, [...ordenes].sort((x, y) => x - y));
  });

  test('el orden fraccionario se DELATA: el contrato 0.5.0 tiene que estar desplegado antes', () => {
    // Si se siembra con la web sirviendo el contrato viejo, `orden: 2.5` no
    // valida y el empalme se descarta EN SILENCIO. Por eso la construcción lo
    // devuelve señalado y el sembrador se niega sin la bandera.
    assert.deepEqual(construir([EMPALME_NUEVO, PORTICO_FIN]).ordenesNoEnteros,
      [{ nombreCanonico: 'LN-627 EMP E03-E04', orden: 2.5 }]);
    // Sin puntos intercalados no hay nada que declarar.
    assert.deepEqual(construir([PORTICO_FIN]).ordenesNoEnteros, []);
    assert.deepEqual(construir().ordenesNoEnteros, []);
  });

  test('dos empalmes en el MISMO vano se bisecan otra vez, no colisionan y NO se adelantan', () => {
    // ⚠️ Esta prueba sellaba el defecto: esperaba que el segundo cayera en 2,25,
    // o sea DELANTE del primero. La bisección repartía hacia atrás y el
    // recorrido salía invertido. Corregido el 2026-08-16 tras la auditoría
    // adversarial; el orden de declaración es el orden de recorrido.
    const segundo = { ...EMPALME_NUEVO, name: 'GPS EMP N2', nombreCanonico: 'LN-627 EMP E03-E04 B' };
    const mapa = porNombre(construir([EMPALME_NUEVO, segundo]).apoyos);
    assert.equal(mapa.get('LN-627 EMP E03-E04').orden, 2.5);
    assert.equal(mapa.get('LN-627 EMP E03-E04 B').orden, 2.75);
    assert.ok(mapa.get('LN-627 EMP E03-E04').orden < mapa.get('LN-627 EMP E03-E04 B').orden,
      'el segundo empalme declarado se adelantó al primero');
    assert.notEqual(mapa.get('LN-627 EMP E03-E04').id, mapa.get('LN-627 EMP E03-E04 B').id);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('LO QUE EL INGENIERO NO APROBÓ NO SE SIEMBRA — y se DICE', () => {

  test('el pórtico de ORIGEN no entra en la lista de apoyos', () => {
    const { apoyos } = construir([EMPALME_NUEVO, PORTICO_FIN, PORTICO_ORIGEN_PENDIENTE]);
    assert.equal(apoyos.length, 28, 'entró un punto que el Ingeniero dejó pendiente de verificar');
    assert.equal(apoyos.find((a) => a.nombreNormalizado === 'LN-627 PORTICO ORIGEN'), undefined);
    assert.equal(apoyos.find((a) => a.nombreCampo === 'GPS PRT O'), undefined);
  });

  test('pero NO se borra ni se calla: sale en `ignorados`, con su motivo', () => {
    const { ignorados } = construir([EMPALME_NUEVO, PORTICO_FIN, PORTICO_ORIGEN_PENDIENTE]);
    assert.equal(ignorados.length, 1);
    assert.deepEqual(ignorados[0], {
      nombreCanonico: 'LN-627 PORTICO ORIGEN',
      nombreCampo: 'GPS PRT O',
      estado: 'pendiente_verificacion',
      motivo: 'el Ingeniero quiere verificarlo antes de cargarlo',
    });
  });

  test('cargar en silencio es el fallo: sin aprobación explícita, fuera', () => {
    // Cualquier cosa que no sea exactamente 'aprobado' queda fuera. La ausencia
    // de bandera NUNCA es aprobación.
    for (const estado of [undefined, null, '', 'pendiente_verificacion', 'rechazado', 'APROBADO', 'aprobado ', 'en_revision']) {
      const { apoyos, ignorados } = construir([{ ...PORTICO_FIN, estado }]);
      assert.equal(apoyos.length, 26, `se sembró un punto con estado «${String(estado)}»`);
      assert.equal(ignorados.length, 1);
      assert.equal(ignorados[0].estado, estado ?? '(sin declarar)');
    }
  });

  test('un punto pendiente tampoco emite su semilla: no puede aparecer en el registro', () => {
    const { semillasNuevas } = construir([EMPALME_NUEVO, PORTICO_FIN, PORTICO_ORIGEN_PENDIENTE]);
    assert.deepEqual(semillasNuevas, [],
      'los 28 aprobados ya están emitidos; el pendiente no puede colarse en el registro');
  });

  test('un punto aprobado SIN semilla emitida se delata antes de escribir nada', () => {
    const inedito = { ...PORTICO_FIN, name: '627 XX', nombreCanonico: 'LN-627 PUNTO INEDITO' };
    const { semillasNuevas } = construir([inedito]);
    assert.equal(semillasNuevas.length, 1);
    assert.equal(semillasNuevas[0].nombreCanonico, 'LN-627 PUNTO INEDITO');
    assert.equal(semillasNuevas[0].semilla, 'punto:LN-627 PUNTO INEDITO');
    assert.equal(semillasNuevas[0].id, idDePunto(LINEA, 'LN-627 PUNTO INEDITO'));
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('EL NOMBRE CANÓNICO MANDA; EL DEL GPS NO ES IDENTIDAD', () => {

  test('el apoyo que el GPS grabó como «E02» es E07 y recibe el id de E07', () => {
    const mapa = porNombre(construir().apoyos);
    const e07 = mapa.get('LN-627 E07');
    assert.equal(e07.nombreCampo, 'E02', 'el mundo sintético debe reproducir el error de campo confirmado por el Ingeniero');
    assert.equal(e07.id, 'd902331d-6447-5f5f-e1a4-8aaa3861a3e8');
    assert.equal(e07.orden, 8);
  });

  test('y el E02 de verdad —grabado «LN 627 E022»— conserva el suyo', () => {
    const e02 = porNombre(construir().apoyos).get('LN-627 E02');
    assert.equal(e02.nombreCampo, 'LN 627 E022');
    assert.equal(e02.id, '24e428a7-021e-6fbf-15de-60d95fcd8c33');
    assert.notEqual(e02.id, porNombre(construir().apoyos).get('LN-627 E07').id);
  });

  test('el nombre de campo se conserva TAL CUAL: es la trazabilidad, no la identidad', () => {
    const apoyos = construir([EMPALME_NUEVO, PORTICO_FIN]).apoyos;
    const mapa = porNombre(apoyos);
    assert.equal(mapa.get('LN-627 EMP E05-E06').nombreCampo, '627 EMP TUB');
    assert.equal(mapa.get('LN-627 EMP E06-E07').nombreCampo, 'EMPT');
    assert.equal(mapa.get('LN-627 PORTICO FIN').nombreCampo, 'GPS PRT F');
    // Y no lleva el nombre de la instalación del cliente a ninguna parte. Se
    // comprueba por FORMA y no con la lista de nombres prohibidos: escribirlos
    // en este archivo —que está en el repositorio PÚBLICO— sería publicarlos,
    // que es justo lo que se quiere impedir. Nombre canónico y nombre de campo
    // solo pueden llevar el código de línea, dígitos y abreviaturas del GPS.
    for (const a of apoyos) {
      assert.match(a.nombreNormalizado, /^LN-627 [A-Z0-9 -]+$/, `canónico limpio: ${a.nombreNormalizado}`);
      assert.match(a.nombreCampo, /^[A-Za-z0-9 -]{1,20}$/, `nombre de campo limpio: ${a.nombreCampo}`);
    }
  });

  test('DOS puntos con el MISMO nombre de campo siguen teniendo identidades distintas', () => {
    // El caso hostil: si el GPS repitiera literalmente el nombre, la identidad
    // no puede confundirse. Sale del canónico, y los canónicos son distintos.
    const base = puntosJulio().map((p) => ({ ...p, name: 'E02' }));
    const apoyos = construirApoyos(LINEA, base, [], { ahora: AHORA, registro: REGISTRO }).apoyos;
    const ids = apoyos.map((a) => a.id);
    assert.equal(new Set(ids).size, 26);
    CANONICOS[LINEA].forEach((n, i) => assert.equal(apoyos[i].id, idDePunto(LINEA, n)));
  });

  test('cambiar TODOS los nombres de campo no mueve ni un id', () => {
    const base = puntosJulio().map((p, i) => ({ ...p, name: `otra-cosa-${i}` }));
    const conOtrosNombres = construirApoyos(LINEA, base, [], { ahora: AHORA, registro: REGISTRO }).apoyos.map((a) => a.id);
    assert.deepEqual(conOtrosNombres, construir().apoyos.map((a) => a.id));
  });

  test('el canónico va al documento como `nombreNormalizado`, que es lo que ve el ingeniero', () => {
    const apoyos = construir().apoyos;
    assert.deepEqual(apoyos.map((a) => a.nombreNormalizado), CANONICOS[LINEA]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('LOS FRENOS — antes se adivinaba; ahora se aborta', () => {

  const falla = (ampliacion, patron) =>
    assert.throws(() => construir(ampliacion), patron);

  test('un punto nuevo SIN función estructural ya no cae a «Suspensión» por defecto', () => {
    // Sembrar un pórtico de subestación como suspensión cambia el corte de
    // tramos de tensión y con él el cálculo mecánico. En silencio.
    for (const funcionEstructural of [undefined, null, '', 'Portico', 'terminal']) {
      falla([{ ...PORTICO_FIN, funcionEstructural }], /funcionEstructural/);
    }
    assert.ok(FUNCIONES['Terminal'], 'la lista blanca sigue admitiendo Terminal');
  });

  test('un punto nuevo sin ROL conocido no se clasifica a ojo', () => {
    // El código real del pórtico tampoco contiene la subcadena "EMP": que el
    // regex viejo acertara con él fue casualidad, no diseño.
    for (const rol of [undefined, null, '', 'portico', 'PORTICO_SUBESTACION']) {
      falla([{ ...PORTICO_FIN, rol }], /rol/);
    }
    assert.equal(porNombre(construir([PORTICO_FIN]).apoyos).get('LN-627 PORTICO FIN').tipoPunto, 'Estructura');
    assert.equal(porNombre(construir([EMPALME_NUEVO]).apoyos).get('LN-627 EMP E03-E04').tipoPunto, 'Empalme');
  });

  test('un punto nuevo que no dice DÓNDE va, no entra', () => {
    const { insertarDespuesDe, ...sinPosicion } = EMPALME_NUEVO;
    falla([sinPosicion], /insertarDespuesDe|insertarAlFinal/);
    falla([{ ...EMPALME_NUEVO, insertarDespuesDe: 'LN-627 E99' }], /no está en el levantamiento/);
  });

  test('un nombre canónico con tilde no entra: cambiaría el id según cómo se escriba', () => {
    falla([{ ...PORTICO_FIN, nombreCanonico: 'LN-627 PÓRTICO FIN' }], /ASCII/);
    falla([{ ...PORTICO_FIN, nombreCanonico: undefined }], /ASCII|nombreCanonico/);
  });

  test('un nombre canónico repetido no entra: serían dos documentos peleándose por un id', () => {
    falla([{ ...PORTICO_FIN, nombreCanonico: 'LN-627 E12' }], /ya está en el levantamiento/);
  });

  test('si el levantamiento base y la lista canónica no cuadran, no se siembra «lo que se pueda»', () => {
    assert.throws(
      () => construirApoyos(LINEA, puntosJulio().slice(0, 20), [], { ahora: AHORA, registro: REGISTRO }),
      /no tiene identidad|canónic/i,
    );
  });

  test('una línea sin lista canónica no se siembra', () => {
    assert.throws(
      () => construirApoyos('LN-999', puntosJulio(), [], { ahora: AHORA, registro: REGISTRO }),
      /nombres canónicos/,
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('EL EXPEDIENTE DE LA FALLA SE ATA POR NOMBRE, NO POR POSICIÓN', () => {

  const FALLA = {
    apoyoCanonico: 'LN-627 E02',
    estructuraOrden: 1,                       // traza histórica: se conserva, deja de mandar
    ocurrioEn: '2026-05-01T00:00:00.000Z',
    fechaTexto: '1 de mayo de 2026',
    placa: '002',
    componenteAfectado: 'cadena de aisladores',
    cronologia: [], observaciones: [], hipotesis: [], verificacionesPendientes: [],
  };

  test('cuelga del MISMO apoyo de hoy: E02 → 24e428a7-…', () => {
    const { apoyos } = construir([EMPALME_NUEVO, PORTICO_FIN]);
    const julio = construir().apoyos;
    const inv = construirInvestigacion(FALLA, apoyos, julio, { codigoLinea: LINEA, ahora: AHORA });
    assert.equal(inv.apoyoId, '24e428a7-021e-6fbf-15de-60d95fcd8c33');
    assert.equal(inv.id, '0e6c753b-8f84-b8f3-5806-b8a5f012ed7b');
  });

  test('y sigue colgando de E02 con la línea ampliada, no de quien ocupe la posición 1', () => {
    const conAmpliacion = construirInvestigacion(FALLA, construir([EMPALME_NUEVO, PORTICO_FIN]).apoyos, construir().apoyos, { codigoLinea: LINEA, ahora: AHORA });
    const sinAmpliacion = construirInvestigacion(FALLA, construir().apoyos, construir().apoyos, { codigoLinea: LINEA, ahora: AHORA });
    assert.equal(conAmpliacion.apoyoId, sinAmpliacion.apoyoId);
  });

  test('sin `apoyoCanonico` no se siembra a ciegas', () => {
    const { apoyoCanonico, ...sinNombre } = FALLA;
    assert.throws(() => construirInvestigacion(sinNombre, construir().apoyos), /apoyoCanonico/);
  });

  test('si apunta a un apoyo que no está en el levantamiento, aborta', () => {
    assert.throws(() => construirInvestigacion({ ...FALLA, apoyoCanonico: 'LN-627 E99', estructuraOrden: null }, construir().apoyos), /no está en el levantamiento/);
  });

  test('CONTROL CRUZADO: si el nombre y la posición histórica discrepan, no se siembra nada', () => {
    // Es la prueba de que la migración no cambió el destino del expediente.
    assert.throws(
      () => construirInvestigacion({ ...FALLA, apoyoCanonico: 'LN-627 E07' }, construir().apoyos, construir().apoyos),
      /dos apoyos distintos/,
    );
  });

  test('el `placa: "002"` NO se usa para resolver: el enlace es el id del apoyo', () => {
    const inv = construirInvestigacion({ ...FALLA, placa: 'lo que sea' }, construir().apoyos, construir().apoyos, { codigoLinea: LINEA, ahora: AHORA });
    assert.equal(inv.apoyoId, '24e428a7-021e-6fbf-15de-60d95fcd8c33');
    // La placa se conserva como dato del expediente, con su ambigüedad
    // declarada: en el levantamiento convive otro punto cuyo nombre de GPS es
    // «E02». No se ha leído en campo, y por eso queda como verificación
    // pendiente y no como corrección.
    assert.equal(inv.placa, 'lo que sea');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LO QUE CAZÓ LA AUDITORÍA ADVERSARIAL DEL 2026-08-16
// ----------------------------------------------------------------------------
// Tres defectos que las 1014 pruebas anteriores dejaban pasar en verde. Ninguno
// fallaba ruidosamente: uno ponía la firma del Ingeniero sobre lo que él no ha
// firmado, otro invertía el recorrido y el tercero dejaba un punto colocado
// donde no va. Van juntos porque comparten la lección: en este sistema, lo que
// no se prueba no se sostiene solo.
// ════════════════════════════════════════════════════════════════════════════
describe('LA AUDITORÍA DEL 16-08', () => {

  /** Un punto nuevo cualquiera, colgado de donde se le diga. */
  const nuevo = (nombreCanonico, insertarDespuesDe, extra = {}) => ({
    name: 'GPS ' + nombreCanonico.slice(-1),
    rol: 'empalme',
    estado: 'aprobado',
    nombreCanonico,
    funcionEstructural: 'Suspensión',
    insertarDespuesDe,
    lat: 1.5, lon: 1.5, ele: 7,
    utc: '2026-08-11T12:00:00.000Z',
    ...extra,
  });

  test('dos puntos en el MISMO vano salen en el orden en que se declaran', () => {
    // El orden de declaración ES el orden de recorrido: es lo único que el
    // Ingeniero declaró correcto de la fuente original («si analizas el
    // recorrido de la línea de principio a fin, el orden está correcto»).
    // La bisección ingenua repartía hacia atrás y devolvía «E03 · B · A · E04»:
    // el recorrido al revés, sin un solo aviso.
    const { apoyos } = construir([
      nuevo('LN-627 EMP A', 'LN-627 E03'),
      nuevo('LN-627 EMP B', 'LN-627 E03'),
    ]);
    const enElVano = apoyos
      .filter((a) => a.orden > 2 && a.orden < 3)
      .sort((a, b) => a.orden - b.orden)
      .map((a) => a.nombreNormalizado);
    assert.deepEqual(enElVano, ['LN-627 EMP A', 'LN-627 EMP B'], 'el recorrido salió invertido');
  });

  test('ni el tercero ni el cuarto se cuelan delante de los anteriores', () => {
    const { apoyos } = construir(['A', 'B', 'C', 'D'].map((n) => nuevo('LN-627 EMP ' + n, 'LN-627 E03')));
    const enElVano = apoyos.filter((a) => a.orden > 2 && a.orden < 3).sort((a, b) => a.orden - b.orden);
    assert.deepEqual(enElVano.map((a) => a.nombreNormalizado),
      ['LN-627 EMP A', 'LN-627 EMP B', 'LN-627 EMP C', 'LN-627 EMP D']);
    // Y ninguno pisa a los vecinos de verdad: siguen en 2 y 3.
    assert.ok(enElVano.every((a) => a.orden > 2 && a.orden < 3), 'un intercalado se salió de su vano');
  });

  test('un punto nuevo se siembra como SUPUESTO, no con la firma del Ingeniero', () => {
    // `confirmado_humano` significa «una persona con criterio lo validó»
    // (contratos/src/comunes.ts). Que el fixture traiga una función escrita no
    // es que el Ingeniero la haya firmado — y la ficha llega a imprimir
    // «confirmada por el Ingeniero». Poner la firma de alguien sobre lo que no
    // firmó es peor que no tener el dato, y los apoyos no se pueden borrar.
    const { apoyos } = construir([nuevo('LN-627 EMP A', 'LN-627 E03')]);
    assert.equal(porNombre(apoyos).get('LN-627 EMP A').funcionProcedencia, 'supuesto');
  });

  test('…y solo se declara confirmada si el levantamiento lo dice con todas las letras', () => {
    const { apoyos } = construir([
      nuevo('LN-627 EMP A', 'LN-627 E03', { funcionProcedencia: 'confirmado_humano' }),
    ]);
    assert.equal(porNombre(apoyos).get('LN-627 EMP A').funcionProcedencia, 'confirmado_humano');
  });

  test('los 26 de julio SÍ van como confirmados: esos los tipificó el Ingeniero', () => {
    // El levantamiento de julio declara «CONFIRMADA por el Ingeniero
    // 2026-07-29» en cada punto. Bajarlos a «supuesto» sería perder un dato
    // real, que es el error simétrico.
    const { apoyos } = construir();
    assert.ok(apoyos.every((a) => a.funcionProcedencia === 'confirmado_humano'));
  });

  test('el MOLDE sigue admitiendo un orden con decimales', () => {
    // Sin esto, toda la ola se cae en silencio: si alguien devuelve `orden` a
    // entero, un empalme con orden 2,5 no valida, `web/src/datos/firestore.ts`
    // lo descarta con `safeParse` sin avisar, y el punto DESAPARECE del mapa y
    // de las fichas. Se lee el archivo como texto porque el contrato es
    // TypeScript y Node no lo puede importar (mismo motivo y mismo patrón que
    // tests/contrato-evidencia.test.js).
    const contrato = readFileSync(new URL('../contratos/src/activos.ts', import.meta.url), 'utf-8');
    const linea = contrato.split('\n').find((l) => /^\s*orden:\s*z\./.test(l));
    assert.ok(linea, 'desapareció el campo `orden` del molde del apoyo');
    assert.ok(!/\.int\(\)/.test(linea),
      'el molde volvió a exigir `orden` entero: el empalme intercalado se descartaría en silencio');
    assert.ok(/nonnegative\(\)/.test(linea), 'el molde dejó de exigir `orden` no negativo');
  });

  test('un punto que va ANTES del primero aborta en vez de colocarse donde quepa', () => {
    // Es el caso del pórtico del extremo de origen, que el Ingeniero dejó
    // pendiente de verificar. Marcarlo «al final» lo dejaba detrás del pórtico
    // del otro extremo, con dos vanos falsos de kilómetros y sin un solo aviso.
    assert.throws(
      () => construir([nuevo('LN-627 PORTICO ORIGEN', null, { insertarAntesDe: 'LN-627 E01' })]),
      /ANTES/,
    );
    assert.throws(
      () => construir([nuevo('LN-627 PORTICO ORIGEN', null, { insertarAlPrincipio: true })]),
      /ANTES/,
    );
  });
});
