// ============================================================================
// tests/sonda-mapa.test.js — la SONDA del mapa, y el banco de pruebas
// ----------------------------------------------------------------------------
// QUÉ SE VIGILA AQUÍ, y por qué merece un guardián propio:
//
//   1. QUE NO VUELVA A HABER UNA SONDA GLOBAL. `window.__mapaLineas` era UNA
//      variable y el componente del mapa se monta en DOS pantallas. La pisaba la
//      última en montarse, nadie la borraba al desmontar, y medir por ahí podía
//      estar midiendo un mapa YA RETIRADO —que contesta `loaded() === false`
//      porque está muerto, no porque esté roto—. De ese dato falso salió media
//      sesión de diagnóstico en la dirección contraria. Una sonda que puede
//      mentir es peor que no tener sonda: la ausencia de dato se nota; el dato
//      falso, no.
//
//   2. QUE TODA ALTA TENGA SU BAJA. Una entrada por instancia solo sirve si se
//      da de baja al desmontar; si no, la lista se llena de fantasmas y volvemos
//      al problema de arriba con más pasos.
//
//   3. QUE EL BANCO DE PRUEBAS NO SE PUBLIQUE. `sonda-satelital.html` monta el
//      mapa con apoyos falsos para poder depurarlo sin sesión. Es una herramienta,
//      no una pantalla del producto: si viajara al sitio, cualquiera tendría una
//      página con un mapa que no es de nadie y datos que no son de nada.
//
// Cero datos de cliente: aquí solo se lee código del propio repositorio.
// ============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const url = (r) => fileURLToPath(new URL(r, import.meta.url));
const leer = (r) => readFileSync(url(r), 'utf-8');

/** El fuente sin comentarios: lo que se vigila es el código, no la prosa que lo explica. */
const sinComentarios = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');

const MAPA = sinComentarios(leer('../web/src/componentes/Mapa.tsx'));
const SONDA = sinComentarios(leer('../web/src/componentes/sondaMapa.ts'));

describe('la sonda del mapa no puede volver a mentir', () => {
  test('ningún componente cuelga el mapa de una variable global suya', () => {
    // El patrón exacto que había: `(window as ...).__mapa = m`. Da igual el
    // nombre: lo que rompe es que sea UNA para DOS instancias.
    const globales = [...MAPA.matchAll(/window[\s\S]{0,80}?\.(__[A-Za-z0-9_]+)\s*=/g)].map((m) => m[1]);
    assert.deepEqual(globales, [],
      `el mapa vuelve a colgarse de globales (${globales.join(', ')}): eso es lo que se pisaba entre pantallas`);
  });

  test('cada instancia se da de ALTA con su pantalla y de BAJA al desmontar', () => {
    assert.match(MAPA, /registrarMapa\(pantalla,/,
      'el alta tiene que declarar EN QUÉ PANTALLA vive; adivinarlo es el error que se corrigió');
    assert.match(MAPA, /retirarMapa\(sonda\.current\)/,
      'sin baja al desmontar, la lista se llena de mapas muertos y volvemos a medir fantasmas');
    // La baja va ANTES del remove(): después, el mapa ya no contesta.
    const i = MAPA.indexOf('retirarMapa(');
    const j = MAPA.indexOf('.remove();', i);
    assert.ok(i > 0 && j > i && j - i < 400,
      'la baja en la sonda tiene que ir justo ANTES del remove(), no después');
  });

  test('las dos pantallas que montan el mapa declaran cuál son', () => {
    for (const [archivo, esperado] of [
      ['../web/src/componentes/Linea.tsx', 'resumen'],
      ['../web/src/componentes/DetalleGps.tsx', 'detalle-gps'],
    ]) {
      assert.match(leer(archivo), new RegExp(`pantalla="${esperado}"`),
        `${archivo} monta un mapa sin decir qué pantalla es: la sonda no podría distinguirlo`);
    }
  });

  test('la sonda lee las teselas por la puerta que usa el renderizador', () => {
    // `_tiles` no existe en MapLibre 6 y contestaba CERO teselas — también del
    // callejero, que estaba pintando. Un cero así manda el diagnóstico al lado
    // contrario. `getIds()` y `getTileByID()` son lo que usa el propio pintor.
    assert.ok(!/_tiles\b/.test(SONDA), 'la sonda volvió a leer `_tiles`, que en MapLibre 6 no existe');
    assert.match(SONDA, /getIds\?\.\(\)/, 'la sonda tiene que enumerar teselas por getIds()');
    assert.match(SONDA, /getTileByID\?\./, 'la sonda tiene que leer cada tesela por getTileByID()');
  });

  test('la sonda no revienta al preguntarle a un mapa muerto', () => {
    // A un mapa retirado `getStyle()` le revienta. Una sonda que se cae a mitad
    // no informa de lo que ya había medido, que es justo lo que hacía falta.
    assert.match(SONDA, /function seguro<T>/, 'toda lectura del mapa va envuelta: un mapa muerto tira excepciones');
  });
});

describe('el banco de pruebas del mapa no se publica', () => {
  const HTML = '../web/sonda-satelital.html';

  test('si existe, está detrás de una variable de entorno y no en el sitio', () => {
    if (!existsSync(url(HTML))) return;   // ya se retiró: nada que vigilar
    const vite = leer('../web/vite.config.ts');
    assert.match(vite, /process\.env\.SONDA_MAPA/,
      'el banco de pruebas se construiría siempre: tiene que ir detrás de SONDA_MAPA');
    assert.ok(!/sonda-satelital/.test(leer('../web/index.html')),
      'la página del producto enlaza el banco de pruebas');
  });

  test('el banco no trae ni una coordenada escrita a mano', () => {
    if (!existsSync(url('../web/src/sonda-satelital.tsx'))) return;
    const banco = leer('../web/src/sonda-satelital.tsx');
    const sospechas = banco.match(/(10\.[0-9]{4,}|-7[45]\.[0-9]{4,})/g) ?? [];
    assert.deepEqual(sospechas, [],
      'el banco escribe coordenadas del Caribe a mano; tiene que derivarlas del recorte público');
  });
});
