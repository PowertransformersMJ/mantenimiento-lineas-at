// ============================================================================
// foto-del-banco.mjs — UNA FOTO DEL LIENZO DEL MAPA, sin nadie delante
// ----------------------------------------------------------------------------
// EL PROBLEMA QUE CIERRA, y costó una sesión entera (`99 §ADR-071`, `34 · L-63`):
// las pestañas desde las que se inspecciona van en SEGUNDO PLANO, y ahí MapLibre
// **no dibuja**. El lienzo sale gris, `isStyleLoaded()` en falso, cero fuentes,
// cero capas — y sin un solo error. Con eso se llegó a declarar una regresión
// global del mapa que no existía, y desde entonces rige la regla: **no se
// publica dibujo de mapa que no se pueda mirar**. Que en la práctica quería
// decir: o lo mira el Ingeniero, o el trabajo se para.
//
// Esto es la tercera salida. Un Chrome SIN CABEZA es una pestaña que sí está en
// primer plano para sí misma: `visibilityState` vale «visible», el reloj de
// animación corre, el trabajador de teselas trabaja y WebGL pinta (por software,
// con SwiftShader, que para mirar un dibujo da igual). Se abre la dirección, se
// espera de verdad —segundos de reloj, no simulados— y se guarda el PNG.
//
// ⚠️ SE ESPERA CON RELOJ REAL Y NO CON `--virtual-time-budget`. Probado: con
// tiempo virtual, el ráster del atlas sale pintado y **las capas vectoriales no**
// —ni los límites departamentales ni el trazado de la línea—, porque quien las
// arma es el trabajador de teselas y el tiempo virtual lo deja sin turno. La foto
// salía «bien» y faltaba justo lo que se iba a comprobar: la peor clase de
// verificación, la que confirma lo que no ha ocurrido.
//
// NO ES UNA PRUEBA AUTOMÁTICA y no pretende serlo: no compara píxeles ni falla
// sola. Es un par de ojos. Lo que decide si el dibujo está bien sigue siendo
// mirarlo — y ahora se puede.
//
// USO:
//   node herramientas/foto-del-banco.mjs "<dirección>" [--salida f.png]
//                                        [--espera 8] [--ancho 1400] [--alto 950]
//                                        [--pulsar "<selector>"] [--veces 6]
//
// `--pulsar` pulsa un elemento antes de disparar —el `+` del mapa, un día, un
// atlas— porque hay dibujos que solo existen en un estado: el trazado de una
// línea de 3 km sobre un mapa de 670 es un punto al encuadre de entrada, y para
// ver que es una LÍNEA hay que acercarse. Sin esto, la foto solo sabría mirar
// la pantalla recién abierta.
//
// El banco vive en `web/sonda-satelital.html`, que SOLO se construye con
// `SONDA_MAPA=1 npm run build` y nunca viaja al sitio publicado. Y abre ya puesto
// por la dirección: `?que=atlas-una&atlas=lluvia`.
// ============================================================================
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Dónde está Chrome. Se puede apuntar a otro con la variable `CHROME`. */
const CHROME = process.env.CHROME
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/** Lo que se espera de reloj antes de disparar, en segundos. */
const ESPERA_POR_DEFECTO = 8;

const args = process.argv.slice(2);
const opcion = (nombre, porDefecto) => {
  const i = args.indexOf('--' + nombre);
  return i >= 0 && args[i + 1] ? args[i + 1] : porDefecto;
};
const direccion = args.find((a) => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--'));
const salida = opcion('salida', 'banco.png');
const espera = Number(opcion('espera', ESPERA_POR_DEFECTO)) * 1000;
const ancho = Number(opcion('ancho', 1400));
const alto = Number(opcion('alto', 950));
const pulsar = opcion('pulsar', null);
const veces = Number(opcion('veces', 1));

if (!direccion) {
  console.error('⛔ falta la dirección. Ej.: node herramientas/foto-del-banco.mjs '
    + '"http://localhost:4173/sonda-satelital.html?que=atlas-una"');
  process.exit(2);
}
if (!existsSync(CHROME)) {
  console.error(`⛔ no encuentro Chrome en «${CHROME}». Apúntalo con la variable CHROME.`);
  process.exit(2);
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * El puerto de depuración que eligió Chrome.
 *
 * Se pide `--remote-debugging-port=0` —que Chrome elija— en vez de clavar el
 * 9222: con un puerto fijo, dos fotos a la vez chocan y la segunda se conecta al
 * Chrome de la primera, fotografiando la pantalla equivocada. Chrome escribe el
 * puerto real en `DevToolsActivePort` de su perfil.
 */
async function puertoDe(perfil) {
  const archivo = join(perfil, 'DevToolsActivePort');
  for (let i = 0; i < 100; i++) {
    if (existsSync(archivo)) {
      const l = readFileSync(archivo, 'utf-8').split('\n');
      if (l[0]?.trim()) return Number(l[0].trim());
    }
    await dormir(100);
  }
  throw new Error('Chrome no publicó su puerto de depuración en 10 s');
}

const perfil = mkdtempSync(join(tmpdir(), 'foto-banco-'));
const chrome = spawn(CHROME, [
  '--headless=new',
  '--remote-debugging-port=0',
  `--user-data-dir=${perfil}`,
  // WebGL por software: SwiftShader. Sin esto, en una máquina sin GPU
  // disponible para el proceso sin cabeza, el lienzo sale en blanco.
  '--enable-unsafe-swiftshader',
  `--window-size=${ancho},${alto}`,
  '--hide-scrollbars',
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

let salio = null;
chrome.on('exit', (c) => { salio = c; });

try {
  const puerto = await puertoDe(perfil);
  // `PUT` y no `GET`: desde Chrome 111 `/json/new` exige PUT.
  const objetivo = await (await fetch(
    `http://127.0.0.1:${puerto}/json/new?${encodeURIComponent(direccion)}`,
    { method: 'PUT' })).json();

  const ws = new WebSocket(objetivo.webSocketDebuggerUrl);
  const respuestas = new Map();
  let n = 0;
  const pedir = (method, params = {}) => new Promise((ok, mal) => {
    const id = ++n;
    respuestas.set(id, { ok, mal });
    ws.send(JSON.stringify({ id, method, params }));
  });
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    const p = respuestas.get(m.id);
    if (!p) return;
    respuestas.delete(m.id);
    m.error ? p.mal(new Error(m.error.message)) : p.ok(m.result);
  });
  await new Promise((ok, mal) => {
    ws.addEventListener('open', ok, { once: true });
    ws.addEventListener('error', () => mal(new Error('no se pudo hablar con Chrome')), { once: true });
  });

  await pedir('Page.enable');
  // Los errores de la página se recogen: un mapa que muere callado es
  // exactamente el fallo que este banco existe para cazar.
  await pedir('Runtime.enable');
  const quejas = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.exceptionThrown') {
      quejas.push(m.params?.exceptionDetails?.exception?.description
        ?? m.params?.exceptionDetails?.text ?? 'excepción sin texto');
    }
  });

  console.log(`⏳ esperando ${espera / 1000} s de reloj a que el mapa termine de dibujar…`);
  await dormir(espera);

  if (pulsar) {
    // Se pulsa DESPUÉS de la espera —sobre un mapa ya montado— y se vuelve a
    // esperar: un clic sobre un mapa a medio construir no hace nada y la foto
    // saldría del estado anterior sin que nada avise.
    for (let i = 0; i < veces; i++) {
      const r = await pedir('Runtime.evaluate', {
        expression: `(() => { const e = document.querySelector(${JSON.stringify(pulsar)});`
          + ' if (!e) return "NO ESTÁ"; e.click(); return "pulsado"; })()',
        returnByValue: true,
      });
      if (r.result?.value === 'NO ESTÁ') throw new Error(`no encuentro «${pulsar}» en la página`);
      await dormir(400);
    }
    console.log(`🖱️  pulsado «${pulsar}» ${veces} vez(ces)`);
    await dormir(2500);
  }

  // Lo que la propia página dice de sus mapas, si tiene sonda. Vale más que la
  // foto para saber si algo está montado: la foto dice cómo se ve, esto dice qué hay.
  const sonda = await pedir('Runtime.evaluate', {
    expression: 'window.__mapas ? JSON.stringify(window.__mapas.lista()) : "sin sonda"',
    returnByValue: true,
  });
  console.log('🛰️  sonda:', sonda.result?.value ?? '—');
  const visible = await pedir('Runtime.evaluate', {
    expression: 'document.visibilityState', returnByValue: true,
  });
  console.log('👁️  visibilityState:', visible.result?.value);

  const foto = await pedir('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(salida, Buffer.from(foto.data, 'base64'));
  console.log(`📸 ${salida}`);
  if (quejas.length) console.log('⚠️  la página se quejó:', quejas.slice(0, 5));
  ws.close();
} finally {
  if (salio === null) chrome.kill();
}
