// ============================================================================
// componentes/sondaMapa.ts — LA SONDA DEL MAPA: una POR INSTANCIA, no una global
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE ESTE ARCHIVO, con nombre y apellido del error que lo obliga:
//
// `window.__mapaLineas` era UNA sola variable y el componente `Mapa` se monta en
// DOS pantallas (Resumen y Detalle GPS). La pisaba el último en montarse, NADIE
// la borraba al desmontar, y la creación es asíncrona —hay un `await` de varios
// megabytes entre «voy a hacer un mapa» y «aquí está»—. Resultado: preguntarle
// a esa variable podía estar preguntándole a un mapa YA RETIRADO, que contesta
// `loaded() === false` y un estilo vacío porque está muerto, no porque esté roto.
//
// Esa medición no probaba NADA, y de ella salió media sesión de diagnóstico
// falso sobre la capa satelital (`10 §ABIERTO`, `32 · L-55/L-58`). Una sonda que
// puede mentir es peor que no tener sonda: la ausencia de dato se nota, un dato
// falso no.
//
// REGLAS DE ESTA SONDA, que son las que le faltaban a la anterior:
//   1. Una entrada por instancia, con su NÚMERO y su PANTALLA. Nada de pisarse.
//   2. Se DA DE BAJA al desmontar, y la baja queda anotada con su hora: un mapa
//      retirado sigue en la lista, marcado como muerto, para poder distinguir
//      «no hay mapa» de «hay uno y está mal».
//   3. Todo se lee con `try`: a un mapa retirado `getStyle()` le revienta, y una
//      sonda que revienta a mitad no informa de lo que ya había medido.
//   4. No se INFIERE nada. Si algo no se puede leer, lo dice; no lo supone.
//
// No es código de depuración de usar y tirar: es el instrumento con el que se
// contesta «¿dónde quedó la capa?» sin adivinar por capturas de pantalla. El
// objeto `Map` ya está en la página — exponerlo no abre nada que no estuviera
// abierto.
// ============================================================================
import type * as maplibregl from 'maplibre-gl';

/** Un aviso del mapa, con la hora a la que ocurrió. */
interface Suceso { hora: string; que: string }

interface Apunte {
  n: number;
  /** En qué pantalla vive esta instancia. Lo declara quien la monta. */
  pantalla: string;
  mapa: maplibregl.Map;
  contenedor: HTMLElement;
  nacio: number;
  /** Cuándo se le llamó a `remove()`. `null` = sigue vivo. */
  murio: number | null;
  sucesos: Suceso[];
  /** Teselas pedidas / llegadas / falladas, por fuente. */
  teselas: Map<string, { pedidas: number; llegadas: number; errores: number }>;
}

const apuntes = new Map<number, Apunte>();
let siguiente = 1;
/** Tope del diario: una sesión larga no puede convertir la sonda en una fuga. */
const TOPE_SUCESOS = 60;

const hhmmss = (t: number) => new Date(t).toLocaleTimeString('es-CO', { hour12: false });

/** Lee algo del mapa sin dejar que un mapa muerto tumbe el informe entero. */
function seguro<T>(f: () => T): T | string {
  try { return f(); } catch (e) { return `⛔ ${(e as Error)?.message ?? String(e)}`; }
}

/**
 * Da de alta una instancia y devuelve su número. Quien la da de alta se queda
 * con ese número y es el único responsable de darla de BAJA.
 */
export function registrarMapa(pantalla: string, mapa: maplibregl.Map, contenedor: HTMLElement): number {
  const n = siguiente++;
  const a: Apunte = {
    n, pantalla, mapa, contenedor,
    nacio: Date.now(), murio: null, sucesos: [], teselas: new Map(),
  };
  apuntes.set(n, a);

  // El diario del propio mapa. Antes esto se iba a `console.warn` y se perdía
  // en cuanto la consola se limpiaba o el aviso salía mientras nadie miraba.
  const cuenta = (fuente: string | undefined, campo: 'pedidas' | 'llegadas' | 'errores') => {
    if (!fuente) return;
    const c = a.teselas.get(fuente) ?? { pedidas: 0, llegadas: 0, errores: 0 };
    c[campo]++;
    a.teselas.set(fuente, c);
  };
  type EvDatos = { dataType?: string; sourceId?: string; tile?: unknown; sourceDataType?: string };
  mapa.on('dataloading', (e) => {
    const d = e as unknown as EvDatos;
    if (d.dataType === 'source' && d.tile) cuenta(d.sourceId, 'pedidas');
  });
  mapa.on('data', (e) => {
    const d = e as unknown as EvDatos;
    if (d.dataType === 'source' && d.tile) cuenta(d.sourceId, 'llegadas');
  });
  mapa.on('error', (e) => {
    const d = e as unknown as EvDatos & { error?: Error };
    if (d.sourceId) cuenta(d.sourceId, 'errores');
    anotar(n, `error${d.sourceId ? ` [${d.sourceId}]` : ''}: ${d.error?.message ?? String(e)}`);
  });

  anotar(n, `alta · pantalla «${pantalla}»`);
  instalarConsola();
  return n;
}

/** Da de baja una instancia. NO la borra: la marca muerta, con su hora. */
export function retirarMapa(n: number): void {
  const a = apuntes.get(n);
  if (!a || a.murio) return;
  a.murio = Date.now();
  anotar(n, 'baja · se llamó a remove()');
  // Solo se conservan las DOS últimas bajas: sirven para explicar un informe
  // raro («estabas mirando el de antes»), no para llevar un historial.
  const muertos = [...apuntes.values()].filter((x) => x.murio).sort((x, y) => x.murio! - y.murio!);
  for (const viejo of muertos.slice(0, -2)) apuntes.delete(viejo.n);
}

/** Anota un suceso en el diario de una instancia. */
export function anotar(n: number, que: string): void {
  const a = apuntes.get(n);
  if (!a) return;
  a.sucesos.push({ hora: hhmmss(Date.now()), que });
  if (a.sucesos.length > TOPE_SUCESOS) a.sucesos.splice(0, a.sucesos.length - TOPE_SUCESOS);
}

/** Las instancias VIVAS, en orden de nacimiento. */
const vivas = () => [...apuntes.values()].filter((a) => !a.murio).sort((a, b) => a.n - b.n);

// ── El informe ─────────────────────────────────────────────────────────────

/** Las capas EN ORDEN DE PINTADO: la primera se pinta abajo del todo. */
function capasDe(m: maplibregl.Map) {
  return seguro(() => m.getStyle().layers.map((l, i) => ({
    i,
    id: l.id,
    tipo: l.type,
    fuente: (l as { source?: string }).source ?? '—',
    visible: (l as { layout?: { visibility?: string } }).layout?.visibility !== 'none',
    opacidad: (l as { paint?: Record<string, unknown> }).paint?.[`${l.type}-opacity`] ?? null,
  })));
}

/** El estado tesela a tesela de una fuente. Es la ÚNICA prueba de que pidió algo. */
function teselasDe(m: maplibregl.Map, idFuente: string) {
  return seguro(() => {
    const gestor = (m as unknown as {
      style?: { tileManagers?: Record<string, { _tiles?: Record<string, { tileID?: { canonical?: { z: number; x: number; y: number } }; state?: string; texture?: unknown }>; used?: boolean; loaded?: () => boolean }> };
    }).style?.tileManagers?.[idFuente];
    if (!gestor) return 'no hay gestor de teselas para esa fuente';
    const t = gestor._tiles ?? {};
    const filas = Object.values(t).map((x) => ({
      zxy: x.tileID?.canonical ? `${x.tileID.canonical.z}/${x.tileID.canonical.x}/${x.tileID.canonical.y}` : '?',
      estado: x.state ?? '?',
      conImagen: Boolean(x.texture),
    }));
    const porEstado: Record<string, number> = {};
    for (const f of filas) porEstado[f.estado] = (porEstado[f.estado] ?? 0) + 1;
    return {
      enUso: gestor.used ?? null,
      cargada: gestor.loaded?.() ?? null,
      nTeselas: filas.length,
      porEstado,
      conImagen: filas.filter((f) => f.conImagen).length,
      filas: filas.slice(0, 24),
    };
  });
}

/** Lo que se sabe de una fuente TAL COMO QUEDÓ dentro del mapa, no como se pidió. */
function fuenteDe(m: maplibregl.Map, id: string) {
  return seguro(() => {
    const s = m.getSource(id) as unknown as {
      type?: string; tiles?: string[]; minzoom?: number; maxzoom?: number;
      tileSize?: number; bounds?: number[]; scheme?: string; loaded?: () => boolean;
      tileBounds?: unknown;
    } | undefined;
    if (!s) return 'NO EXISTE';
    return {
      tipo: s.type, teselas: s.tiles, minzoom: s.minzoom, maxzoom: s.maxzoom,
      tileSize: s.tileSize, limites: s.bounds, esquema: s.scheme,
      cargada: s.loaded?.() ?? null,
      recorteAplicado: Boolean(s.tileBounds),
    };
  });
}

/** El informe completo de UNA instancia. */
function informe(a: Apunte) {
  const m = a.mapa;
  const ID = 'raster-satelital';
  const capas = capasDe(m);
  const orden = Array.isArray(capas) ? capas.findIndex((c) => c.id === ID) : -1;
  const rotulos = Array.isArray(capas)
    ? capas.findIndex((c) => /label|shield/.test(c.id) || c.id.startsWith('places'))
    : -1;

  return {
    quien: `#${a.n} · ${a.pantalla}`,
    vivo: !a.murio,
    retirado: a.murio ? `sí, a las ${hhmmss(a.murio)} — este informe es de un mapa MUERTO` : 'no',
    enElDom: document.body.contains(a.contenedor),
    lienzoVisible: seguro(() => {
      const r = a.contenedor.getBoundingClientRect();
      return `${Math.round(r.width)}×${Math.round(r.height)} px`;
    }),
    mapa: {
      cargado: seguro(() => m.loaded()),
      estiloMontado: seguro(() => m.isStyleLoaded()),
      teselasQuietas: seguro(() => m.areTilesLoaded()),
      zoom: seguro(() => Number(m.getZoom().toFixed(2))),
      centro: seguro(() => { const c = m.getCenter(); return [Number(c.lng.toFixed(5)), Number(c.lat.toFixed(5))]; }),
      encuadre: seguro(() => m.getBounds().toArray().flat().map((v) => Number(v.toFixed(4)))),
    },
    satelital: {
      capaExiste: seguro(() => Boolean(m.getLayer(ID))),
      fuenteExiste: seguro(() => Boolean(m.getSource(ID))),
      visibilidad: seguro(() => (m.getLayer(ID) ? m.getLayoutProperty(ID, 'visibility') ?? 'visible' : '—')),
      opacidad: seguro(() => (m.getLayer(ID) ? m.getPaintProperty(ID, 'raster-opacity') : '—')),
      ordenDePintado: orden,
      primerRotuloEn: rotulos,
      porEncimaDeLosRotulos: orden >= 0 && rotulos >= 0 ? orden > rotulos : null,
      fuente: fuenteDe(m, ID),
      teselas: teselasDe(m, ID),
    },
    base: { fuente: fuenteDe(m, 'protomaps'), teselas: teselasDe(m, 'protomaps') },
    capas,
    contadores: Object.fromEntries(a.teselas),
    sucesos: a.sucesos,
  };
}

// ── La consola ─────────────────────────────────────────────────────────────

let instalada = false;

/**
 * Cuelga la sonda del `window`. Se instala UNA vez, en cuanto nace el primer
 * mapa: colgarla al importar el módulo dejaría un `__mapas` que contesta «no hay
 * ninguno» antes incluso de que la pantalla lo intente, y eso se lee como avería.
 */
function instalarConsola(): void {
  if (instalada) return;
  instalada = true;
  const w = window as unknown as Record<string, unknown>;

  w.__mapas = {
    /** La tabla corta: qué instancias hay y cuál está viva. Empieza por aquí. */
    lista() {
      const filas = [...apuntes.values()].sort((a, b) => a.n - b.n).map((a) => ({
        n: a.n, pantalla: a.pantalla, vivo: !a.murio,
        edad_s: Math.round((( a.murio ?? Date.now()) - a.nacio) / 1000),
        enElDom: document.body.contains(a.contenedor),
        cargado: seguro(() => a.mapa.loaded()),
        satelital: seguro(() => (a.mapa.getLayer('raster-satelital') ? 'capa puesta' : 'sin capa')),
      }));
      console.table(filas);
      return filas;
    },
    /** El informe completo. Sin número: todas las VIVAS. */
    ver(n?: number) {
      if (typeof n === 'number') {
        const a = apuntes.get(n);
        return a ? informe(a) : `no hay ninguna instancia #${n}`;
      }
      const v = vivas();
      if (!v.length) return 'NO HAY NINGÚN MAPA VIVO ahora mismo. `__mapas.lista()` enseña los retirados.';
      return v.map(informe);
    },
    /** El objeto `Map` crudo, para seguir hurgando a mano. */
    crudo(n?: number) {
      const v = vivas();
      if (typeof n === 'number') return apuntes.get(n)?.mapa;
      if (v.length === 1) return v[0].mapa;
      console.warn(`[sonda] hay ${v.length} mapas vivos: pide uno por número, p. ej. __mapas.crudo(${v[0]?.n ?? 1}).`);
      return v.map((a) => a.mapa);
    },
  };

  // Compatibilidad con la costumbre vieja, pero SIN la mentira: si hay una sola
  // instancia viva, devuelve ésa; si hay cero o varias, lo DICE en vez de dar un
  // objeto cualquiera. Es un getter, así que nunca se queda apuntando a un mapa
  // que ya se retiró.
  Object.defineProperty(w, '__mapaLineas', {
    configurable: true,
    get() {
      const v = vivas();
      if (v.length === 1) return v[0].mapa;
      console.warn(
        v.length === 0
          ? '[sonda] no hay ningún mapa vivo. Usa __mapas.lista().'
          : `[sonda] hay ${v.length} mapas vivos y esta variable no puede elegir. Usa __mapas.crudo(n).`,
      );
      return null;
    },
  });

  console.info('[sonda] mapa instrumentado · __mapas.lista() · __mapas.ver() · __mapas.crudo(n)');
}
