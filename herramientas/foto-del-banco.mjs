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
// NACIÓ COMO UN PAR DE OJOS Y NO COMO UNA PRUEBA: miraba, imprimía y salía con
// 0 pasara lo que pasara, porque al otro lado había un humano leyendo. Desde
// `99 §ADR-085` tiene además **modo portero** (`--exigir`): las mismas cuatro
// cosas que miraba una persona, pero pudiendo DECIR QUE NO. Hizo falta el día
// que se encendió la fusión automática de las propuestas del vigía: sin humano
// mirando, un lienzo en blanco llegaría a producción sin que nada chistara.
// Sigue sin opinar de estética — dice si hay algo dibujado, no si es bonito.
//
// USO:
//   node herramientas/foto-del-banco.mjs "<dirección>" [--salida f.png]
//                                        [--espera 8] [--ancho 1400] [--alto 950]
//                                        [--pulsar "<selector>"] [--veces 6]
//                                        [--exigir] [--exigir-capa capa-temp]
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

/**
 * Dónde está Chrome. Se puede apuntar a otro con la variable `CHROME`.
 *
 * Se busca en varios sitios y no solo en el de la Mac del Ingeniero desde que
 * esto corre también en el servidor de GitHub (`99 §ADR-085`): allí el ejecutable
 * se llama `google-chrome` y vive en `/usr/bin`. Clavar una sola ruta habría
 * hecho que el portero fallara SIEMPRE en el servidor — y un portero que siempre
 * dice que no acaba desactivado, que es peor que no tenerlo.
 */
// ⚠️ Si `CHROME` viene puesta, es la ÚNICA candidata. Buscar alternativas
// cuando alguien ha dicho explícitamente cuál quiere sería desobedecer en
// silencio: se pediría un Chrome y se usaría otro, y la foto saldría de un
// navegador que no es el que se quería probar. Puesta y mala → error claro.
const CANDIDATOS = process.env.CHROME ? [process.env.CHROME] : [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
];
const CHROME = CANDIDATOS.find((c) => existsSync(c)) ?? CANDIDATOS[0];

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
/**
 * ⚖️ MODO PORTERO (`99 §ADR-085`). Sin esto, esta herramienta MIRA y siempre
 * dice que sí: imprime lo que ve y sale con 0 aunque el lienzo esté en blanco.
 * Servía porque al otro lado había un humano leyendo. Con la fusión automática
 * encendida ya no lo hay, así que hace falta que el mismo par de ojos pueda
 * **decir que no** y parar la publicación.
 *
 * `--exigir` comprueba cuatro cosas, y las cuatro son las que un humano miraba:
 * que haya un mapa VIVO y cargado · que la página no se haya quejado · que la
 * capa que se acaba de reconstruir esté PUESTA · y que el lienzo tenga DIBUJO,
 * no un color liso. Cualquiera que falle → salida 1 y nadie publica.
 */
const exigir = args.includes('--exigir');
const exigirCapa = opcion('exigir-capa', null);

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
/**
 * ⏱️ CUÁNTO SE LE DA A CHROME PARA ARRANCAR. Eran 10 s y **no llegaban**.
 *
 * Medido el 2026-08-25 en el servidor de GitHub (`99 §ADR-085`): con seis
 * trabajos del vigía compartiendo la máquina, cinco atlas abrieron Chrome sin
 * problema y el sexto —temperatura— se quedó sin puerto a los 10 s. No era el
 * sandbox ni la ruta: era **arranque en frío con la máquina cargada**.
 *
 * 40 s no ralentiza nada cuando va bien —se sale en cuanto aparece el puerto— y
 * evita el peor de los fallos posibles aquí: que el portero suspenda un atlas
 * BUENO por su propia lentitud. Un portero así se acaba desactivando, y entonces
 * no hay portero.
 */
const ESPERA_DE_ARRANQUE = Number(process.env.ESPERA_ARRANQUE_CHROME ?? 40) * 1000;

async function puertoDe(perfil) {
  const archivo = join(perfil, 'DevToolsActivePort');
  for (let i = 0; i < ESPERA_DE_ARRANQUE / 100; i++) {
    if (existsSync(archivo)) {
      const l = readFileSync(archivo, 'utf-8').split('\n');
      if (l[0]?.trim()) return Number(l[0].trim());
    }
    await dormir(100);
  }
  // ⚠️ Y SE CUENTA LO QUE DIJO CHROME (`99 §ADR-085`). Antes este error decía
  // solo «no publicó su puerto» y la queja de Chrome se tiraba: la tubería de
  // `stderr` estaba abierta y **nadie la leía**. Sin ese dato, el primer fallo
  // en el servidor se diagnosticó MAL —se culpó a la caja de arena— y se llegó a
  // escribir un arreglo para una causa que no era. Un error que no se lee no
  // solo se pierde: manda a arreglar lo que no está roto.
  throw new Error(`Chrome no publicó su puerto de depuración en ${ESPERA_DE_ARRANQUE / 1000} s.`
    + (queLlora.trim() ? `\n   Chrome dijo: ${queLlora.trim().split('\n').slice(-4).join('\n   ')}`
      : `\n   Y no dijo nada. ¿Existe «${CHROME}»? ¿O iba la máquina muy cargada?`));
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

/** Lo que Chrome se queja por `stderr`. Se GUARDA: ver `puertoDe`. */
let queLlora = '';
chrome.stderr.on('data', (d) => { queLlora += d.toString(); });

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

  // ── ⚖️ EL PORTERO ────────────────────────────────────────────────────────
  if (exigir) {
    const faltas = [];

    // 1 · ¿Hay un mapa vivo, en el DOM y cargado? Es lo primero que un humano
    //     comprueba sin darse cuenta: que haya mapa.
    let lista = [];
    try { lista = JSON.parse(sonda.result?.value ?? '[]'); } catch { /* sin sonda */ }
    if (!Array.isArray(lista) || !lista.length) {
      faltas.push('la página no tiene sonda o no nació ningún mapa '
        + '(¿construiste con SONDA_MAPA=1 y abriste `sonda-satelital.html`?)');
    } else if (!lista.some((m) => m.vivo && m.enElDom && m.cargado === true)) {
      faltas.push(`ningún mapa VIVO y cargado: ${JSON.stringify(lista)}`);
    }

    // 2 · ¿Se quejó la página? Un mapa que muere callado es justo lo que este
    //     banco existe para cazar, y con fusión automática nadie lee la consola.
    if (quejas.length) faltas.push(`la página lanzó ${quejas.length} excepción(es): ${quejas[0]}`);

    // 3 · ¿Está PUESTA la capa que se acaba de reconstruir? Que el mapa pinte no
    //     prueba que pinte LO NUEVO: la base de Protomaps se ve preciosa con el
    //     atlas ausente, y ésa es exactamente la foto que engaña.
    if (exigirCapa) {
      const r = await pedir('Runtime.evaluate', {
        expression: `(() => { const v = window.__mapas?.ver?.();
          const t = Array.isArray(v) ? v : [v];
          for (const i of t) {
            const c = i?.capas;
            if (Array.isArray(c) && c.some((x) => x.id === ${JSON.stringify(exigirCapa)})) return 'PUESTA';
          }
          return 'NO ESTÁ'; })()`,
        returnByValue: true,
      });
      if (r.result?.value !== 'PUESTA') faltas.push(`la capa «${exigirCapa}» NO está en el mapa`);
      else console.log(`🧩 capa «${exigirCapa}»: puesta`);
    }

    // 4 · ¿El lienzo tiene DIBUJO o es un color liso? Se le devuelve la foto a la
    //     página, se pinta en un lienzo 2D y se cuentan los colores DEL RECUADRO
    //     DEL MAPA —no de la pantalla entera, que siempre trae texto y botones—.
    //     Se usa el decodificador de PNG del propio navegador: cero dependencias.
    const pintura = await pedir('Runtime.evaluate', {
      awaitPromise: true, returnByValue: true,
      expression: `(async () => {
        const caja = document.querySelector('.maplibregl-map')?.getBoundingClientRect();
        if (!caja || caja.width < 40 || caja.height < 40) return { error: 'no encuentro el recuadro del mapa' };
        const img = new Image();
        img.src = 'data:image/png;base64,${foto.data}';
        await img.decode();
        const l = document.createElement('canvas');
        l.width = Math.round(caja.width); l.height = Math.round(caja.height);
        l.getContext('2d').drawImage(img, Math.round(caja.x), Math.round(caja.y),
          l.width, l.height, 0, 0, l.width, l.height);
        const d = l.getContext('2d').getImageData(0, 0, l.width, l.height).data;
        // Se cuantiza a 4 bits por canal: dos verdes casi iguales no son dos
        // colores para un ojo, y sin cuantizar el ruido del antialiasing
        // inflaría la cuenta hasta hacer pasar un lienzo casi liso.
        const cuenta = new Map();
        for (let i = 0; i < d.length; i += 4 * 7) {
          const k = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
          cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
        }
        const total = [...cuenta.values()].reduce((a, b) => a + b, 0);
        return { distintos: cuenta.size, dominante: Math.max(...cuenta.values()) / total };
      })()`,
    });
    const p = pintura.result?.value ?? {};
    if (p.error) {
      faltas.push(p.error);
    } else {
      const plano = p.distintos < 24 || p.dominante > 0.9;
      console.log(`🎨 lienzo: ${p.distintos} colores · el más repetido ocupa `
        + `${Math.round(p.dominante * 100)} %${plano ? '  ← PLANO' : ''}`);
      if (plano) {
        faltas.push(`el recuadro del mapa está PLANO (${p.distintos} colores, `
          + `${Math.round(p.dominante * 100)} % del mismo): no se pintó nada que mirar`);
      }
    }

    if (faltas.length) {
      console.error('\n⛔ EL BANCO DICE QUE NO. Esto no se publica:');
      for (const f of faltas) console.error(`   · ${f}`);
      console.error(`\n   La foto queda en ${salida} para que se pueda mirar.`);
      ws.close();
      process.exitCode = 1;
    } else {
      console.log('✅ el banco dice que sí: mapa vivo, capa puesta, lienzo con dibujo.');
      ws.close();
    }
  } else {
    ws.close();
  }
} finally {
  if (salio === null) chrome.kill();
}
