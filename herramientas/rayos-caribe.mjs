#!/usr/bin/env node
// ============================================================================
// rayos-caribe.mjs — el atlas de DESCARGAS ATMOSFÉRICAS, hora a hora
// ----------------------------------------------------------------------------
// El sexto atlas, y el primero que NO viene de NASA POWER: POWER no publica
// rayos (comprobado el 2026-08-24: 105 parámetros horarios y ninguno cuenta
// descargas). Éste viene del **GLM del GOES-19**, el detector óptico de rayos
// del satélite geoestacionario que mira América — datos públicos de NOAA en AWS,
// sin llave (`99 §ADR-079`).
//
// ⚠️ ESTE ATLAS SE ACUMULA, NO SE RECONSTRUYE, y esa es la diferencia de fondo
// con los otros cinco. Los de POWER se rehacen enteros en cada pasada porque su
// fuente entrega un año en 36 llamadas. Aquí el año son **1,6 millones de
// archivos y medio terabyte**: bajarlo entero no es una opción, ni aquí ni en
// CI. Así que cada pasada baja SOLO las horas que faltan y las suma al libro
// (`rayos-conteo.json`), y de ese libro salen los PNG. El atlas empieza vacío y
// se llena solo: en un mes hay un mes.
//
// ⚠️ LA HORA SE PASA AL RELOJ DE COLOMBIA AL GUARDARLA. Los archivos del
// satélite van en UTC y la pantalla rotula «hora de Colombia»: un archivo de las
// 23:00 UTC son las **18:00** del mismo día aquí, y uno de las 03:00 UTC son las
// 22:00 del día ANTERIOR. Guardarlo en UTC y rotularlo como local corre la
// tormenta cinco horas — el fallo de `32 · L-70`, otra vez.
//
// Uso:
//   node herramientas/rayos-caribe.mjs                 # las últimas 24 h
//   node herramientas/rayos-caribe.mjs --horas 48      # las últimas 48 h
//   node herramientas/rayos-caribe.mjs --desde 2026-08-20T00 --hasta 2026-08-22T00
//   node herramientas/rayos-caribe.mjs --solo-publicar  # sin bajar: rehace los PNG
// ============================================================================
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as h5wasm from 'h5wasm/node';
import { ANCHO, ALTO, OESTE, ESTE, SUR, NORTE, publicarAtlas } from './atlas-caribe.mjs';
import {
  PERFIL_RAYOS, RUTA_LIBRO, SOBRE, celdasDelLibro, claveColombia, diarioDelLibro,
  escribirLibro, leerLibro,
} from './rayos-libro.mjs';

/** El satélite que mira América. GOES-19 es el GOES-East desde 2025. */
const CUBO = 'https://noaa-goes19.s3.amazonaws.com';
const PRODUCTO = 'GLM-L2-LCFA';

// ════════════════════════════════════════════════════════════════════════════
// BAJAR UNA HORA DEL SATÉLITE
// ════════════════════════════════════════════════════════════════════════════

/** El día del año (1-366) de una fecha UTC, que es como el satélite ordena sus carpetas. */
const diaDelAnio = (d) => Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000) + 1;

/**
 * Una petición con reintentos. Son ~180 descargas por hora de atlas y basta un
 * corte de red de un segundo para tirar la hora entera: sin esto, la
 * acumulación se rompe sola cada pocos días y el hueco no se nota hasta que
 * alguien mira el mapa. Misma decisión que `pedir()` en el motor de POWER.
 */
async function traer(url, intentos = 4) {
  let ultimo;
  for (let i = 0; i < intentos; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return r;
      ultimo = new Error(`respondió ${r.status}`);
      // 404 no se reintenta: el archivo no existe y no va a aparecer.
      if (r.status === 404) throw ultimo;
    } catch (e) {
      ultimo = e;
      if (String(e.message).includes('404')) throw e;
    }
    await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }
  throw new Error(`${url.slice(-60)} — ${ultimo?.message ?? 'sin respuesta'}`);
}

async function listarHora(fechaUtc) {
  const anio = fechaUtc.getUTCFullYear();
  const ddd = String(diaDelAnio(fechaUtc)).padStart(3, '0');
  const hh = String(fechaUtc.getUTCHours()).padStart(2, '0');
  const claves = [];
  let token = '';
  do {
    const u = `${CUBO}/?list-type=2&prefix=${PRODUCTO}/${anio}/${ddd}/${hh}/&max-keys=1000`
      + (token ? `&continuation-token=${encodeURIComponent(token)}` : '');
    const xml = await (await traer(u)).text();
    claves.push(...[...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]));
    token = (xml.match(/<NextContinuationToken>([^<]+)</) ?? [])[1] ?? '';
  } while (token);
  return claves;
}

/**
 * Los rayos de UNA hora UTC, contados por celda y repartidos en las claves del
 * reloj de Colombia. Devuelve `null` si el satélite no tiene esa hora todavía.
 *
 * ⚠️ CADA ARCHIVO SE BORRA EN CUANTO SE LEE. Son 180 archivos de ~300 KB por
 * hora: guardarlos llenaría el disco en dos días de acumulación y no aportan
 * nada — lo que se conserva es el conteo, que ocupa mil veces menos.
 */
export async function contarHora(fechaUtc, { lote = 8, carpeta } = {}) {
  const claves = await listarHora(fechaUtc);
  if (!claves.length) return null;
  const tmp = carpeta ?? join(tmpdir(), `rayos-${Date.now()}`);
  mkdirSync(tmp, { recursive: true });
  const porClave = new Map();          // "AAAAMMDDHH" → Map("fx,fy" → rayos)
  let leidos = 0;
  try {
    for (let i = 0; i < claves.length; i += lote) {
      await Promise.all(claves.slice(i, i + lote).map(async (k, j) => {
        const r = await traer(`${CUBO}/${k}`);
        const ruta = join(tmp, `g${i + j}.nc`);
        writeFileSync(ruta, Buffer.from(await r.arrayBuffer()));
        // El instante del archivo sale de SU NOMBRE (…_sAAAADDDHHMMSSm_…), que
        // es UTC. No se usa el reloj de esta máquina para nada.
        const m = k.match(/_s(\d{4})(\d{3})(\d{2})/);
        const inicio = new Date(Date.UTC(+m[1], 0, 1, +m[3]));
        inicio.setUTCDate(+m[2]);
        const clave = claveColombia(inicio);
        const f = new h5wasm.File(ruta, 'r');
        const la = f.get('flash_lat')?.value, lo = f.get('flash_lon')?.value;
        if (la && lo) {
          const celdas = porClave.get(clave) ?? new Map();
          for (let n = 0; n < la.length; n++) {
            if (lo[n] < OESTE || lo[n] > ESTE || la[n] < SUR || la[n] > NORTE) continue;
            const fx = Math.min(ANCHO - 1, Math.floor(lo[n] - OESTE));
            const fy = Math.min(ALTO - 1, Math.floor(NORTE - la[n]));
            const c = `${fx},${fy}`;
            celdas.set(c, (celdas.get(c) ?? 0) + 1);
          }
          porClave.set(clave, celdas);
        }
        f.close();
        rmSync(ruta, { force: true });
        leidos++;
      }));
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return { archivos: leidos, porClave };
}

// ════════════════════════════════════════════════════════════════════════════
// EL PROGRAMA
// ════════════════════════════════════════════════════════════════════════════

const arg = (n, d) => {
  const i = process.argv.indexOf('--' + n);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};

async function principal() {
  const salida = arg('salida', 'web/public/mapas');
  const libro = leerLibro();
  libro.sobre = SOBRE;

  if (!process.argv.includes('--solo-publicar')) {
    await h5wasm.ready;
    // La ventana, en horas UTC completas. La hora en curso NO se baja: estaría a
    // medias y quedaría escrita en el libro como si estuviera entera.
    const ahora = new Date();
    const finUtc = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate(),
      ahora.getUTCHours()) - 3600000);
    const horas = Number(arg('horas', 24));
    const desde = arg('desde', null);
    const inicioUtc = desde ? new Date(`${desde}:00:00Z`)
      : new Date(finUtc.getTime() - (horas - 1) * 3600000);
    const hastaUtc = arg('hasta', null) ? new Date(`${arg('hasta')}:00:00Z`) : finUtc;

    let pendientes = [];
    for (let t = inicioUtc.getTime(); t <= hastaUtc.getTime(); t += 3600000) {
      const u = new Date(t);
      // Una hora UTC puede repartir sus rayos en dos claves de Colombia solo si
      // el reparto fuese por minutos; aquí no: −5 en punto mueve la hora entera.
      if (!libro.horas[claveColombia(u)]) pendientes.push(u);
    }
    /**
     * ⚠️ UN TOPE DE HORAS POR PASADA, y no es una limitación: es lo que impide
     * que una semana sin aprobar la propuesta convierta la siguiente corrida en
     * una descarga de 9 GB y dos horas y media. Con tope, el atlas se pone al día
     * SOLO, un trozo por pasada, y ninguna corrida se sale de madre. Se atienden
     * las horas MÁS VIEJAS primero: el hueco se cierra por donde se abrió.
     */
    const maximo = Number(arg('maximo', 0));
    if (maximo > 0 && pendientes.length > maximo) {
      console.log(`· hay ${pendientes.length} horas pendientes; esta pasada atiende ${maximo}`);
      pendientes = pendientes.slice(0, maximo);
    }
    console.log(`· rayos · ${pendientes.length} hora(s) por bajar `
      + `(${inicioUtc.toISOString().slice(0, 13)}Z → ${hastaUtc.toISOString().slice(0, 13)}Z)`);

    let bajadas = 0;
    for (const u of pendientes) {
      const r = await contarHora(u);
      if (!r) { console.log(`  ${u.toISOString().slice(0, 13)}Z · el satélite aún no la tiene`); continue; }
      for (const [clave, celdas] of r.porClave) {
        libro.horas[clave] = Object.fromEntries([...celdas.entries()].sort());
      }
      const total = [...r.porClave.values()].reduce((s, c) => s + [...c.values()].reduce((a, b) => a + b, 0), 0);
      console.log(`  ${u.toISOString().slice(0, 13)}Z → ${[...r.porClave.keys()].join(',')} · `
        + `${r.archivos} archivos · ${total} rayos en la región`);
      bajadas++;
      escribirLibro(libro);            // se guarda hora a hora: un corte no tira el trabajo
    }
    console.log(`· ${bajadas} hora(s) nuevas en el libro`);
  }

  const claves = Object.keys(libro.horas);
  if (!claves.length) {
    console.error('⛔ el libro está vacío: no hay nada que publicar todavía.');
    process.exit(1);
  }
  const anio = +claves[0].slice(0, 4);
  publicarAtlas(PERFIL_RAYOS, celdasDelLibro(libro), diarioDelLibro(libro), { salida, anio });
  console.log(`   libro: ${claves.length} horas · ${(readFileSync(RUTA_LIBRO).length / 1024).toFixed(0)} KiB`);
}

if (process.argv[1] && process.argv[1].endsWith('rayos-caribe.mjs')) {
  principal().catch((e) => { console.error('\n❌', e.message); process.exit(1); });
}
