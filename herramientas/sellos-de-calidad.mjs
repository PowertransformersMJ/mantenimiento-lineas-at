#!/usr/bin/env node
// ============================================================================
// herramientas/sellos-de-calidad.mjs — qué horas NO son medida, antes de cargar
// ----------------------------------------------------------------------------
// QUÉ RESUELVE (`99 §ADR-128`). Su SCADA exporta, junto a cada magnitud, un
// archivo `_quality` con un sello por hora: `Actual` cuando la hora se midió de
// verdad. Cualquier otro sello —«Not Renewed», «Invalid»— dice que ese número
// NO lo tomó nadie: el historiador repitió el último valor o guardó basura.
// La pantalla no enseña el sello (`TODO-102 ①`), así que esas horas se cargarían
// como medida. El 20-04 se encontró A MANO: doce horas con 199 A congelados.
// Esto hace esa misma lectura para cualquier bahía y la deja escrita.
//
// ⚠️ SOLO LECTURA. No escribe en las carpetas de datos, no aparta nada y no
// decide nada: INFORMA. Qué se hace con cada bloque lo decide el Ingeniero.
// Lo único que escribe es el listado de `--json`: nunca encima de otro y nunca
// dentro del repositorio —lleva las etiquetas reales de la bahía—.
//
// ⚠️ DÓNDE ESTÁN LOS SELLOS. El paso 2 (`juntar-por-dia.mjs`) aparta los
// `_quality` —no son medidas— y su carpeta de salida NO los trae. Los sellos
// siguen en la carpeta del paso 1, la de la bahía. Por eso se pasan aparte:
//   · la carpeta principal (la del paso 2) da los VALORES —y sus sellos, si
//     alguno trajera—;
//   · `--sellos` (la del paso 1) da SOLO los sellos: sus medidas no se leen,
//     para que el mismo valor no se cuente dos veces.
//
// ⚠️ UN DÍA SIN SELLO NO ES UN DÍA «Actual». Se dice «sin sello» —por día, y por
// señal cuando el día trae sello de otras— y nunca se cuenta como medida buena.
//
// ⚠️ EL DÍA SALE DEL DATO, con la regla del lector (`99 §ADR-119/126/127`): cada
// columna vale por el instante que declara su eje, leído por
// `encontrarEjeDeTiempo` del núcleo, y si la carga mezcla día/mes con mes/día no
// se informa nada: un bloque fechado al revés señalaría el día equivocado.
//
// BLOQUE = horas SEGUIDAS —también de un día al siguiente— en las que al menos
// una señal trae un sello que no es `Actual`.
//
// DOS LECTURAS DE LOS VALORES en cada bloque, con umbrales simples y declarados
// (arriba del todo, `HORAS_IGUALES_PARA_CONGELADO` y `RANGO_FISICO`):
//   · CONGELADO: una serie (estadístico·señal) repite EXACTAMENTE el mismo valor
//     en 3 horas seguidas o más. Se mira desde la hora ANTERIOR al sello malo,
//     porque un valor retenido es justo el último bueno repetido.
//   · FUERA DE RANGO FÍSICO EVIDENTE: una cifra que ninguna línea de alta tensión
//     puede dar. No son límites de operación: son topes anchos a propósito.
//
//   node herramientas/sellos-de-calidad.mjs <carpeta-del-paso-2> [--sellos <carpeta-del-paso-1>] [--json <ruta>]
//
// Salida: 0 = todo leído · 1 = ningún sello, algún archivo apartado, choques o
// fechas mezcladas (el informe está incompleto) · 2 = uso incorrecto.
// ============================================================================
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync, mkdirSync, realpathSync } from 'node:fs';
import { join, basename, relative, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { celdasDeCsv, separadorDe } from '../importar/csv.js';
import {
  CALIDAD_BUENA, campoDeSenal, encontrarEjeDeTiempo, esArchivoDeCalidad, estadisticoDeNombre, ordenDeLaCarga,
} from '../nucleo/cargabilidadAncho.js';
// ⚠️ LA CUENTA DE LOS SELLOS NO SE ESCRIBE AQUÍ. Cada hora·señal vale UNA vez la
// traigan uno o cinco archivos, y quién la cuenta es el núcleo
// (`nucleo/cargaPorLotes.js#indiceDeSellos`), el mismo que usa la pantalla de
// cargabilidad. Tener cada uno la suya costó un «×9» aquí y un «×8» allá sobre
// el mismo dato —1.080 lecturas repetidas en LN-617— con el agravante de que ese
// texto se escribe en un rastro que no se puede corregir (`99 §ADR-128`).
import { ejeConHorasRepetidas, indiceDeSellos, MOTIVO_EJE_NO_HORARIO } from '../nucleo/cargaPorLotes.js';

/**
 * CONGELADO: cuántas horas seguidas con el MISMO valor bastan para decirlo.
 * Con dos, una tensión estable a 68,0 kV saltaría por casualidad; con tres
 * horas seguidas y un sello que ya dice que la hora no se midió, es retención.
 */
const HORAS_IGUALES_PARA_CONGELADO = 3;

/**
 * FUERA DE RANGO FÍSICO EVIDENTE, por magnitud (la propone `campoDeSenal`).
 * Topes ANCHOS a propósito: no juzgan si la medida es mala, señalan la que no
 * puede ser. Una corriente o una tensión eficaz no son negativas; 5 kA no los
 * lleva ningún circuito de alta tensión; la mayor tensión de transmisión del
 * país es 500 kV; 5.000 MW es más que cualquier circuito de 500 kV. Una señal
 * de magnitud desconocida no se juzga aquí.
 */
const RANGO_FISICO = {
  corriente_A: { min: 0, max: 5000, unidad: 'A' },
  tension_kV: { min: 0, max: 1000, unidad: 'kV' },
  potenciaActiva_MW: { min: -5000, max: 5000, unidad: 'MW' },
  potenciaReactiva_MVAr: { min: -5000, max: 5000, unidad: 'MVAr' },
  potenciaAparente_MVA: { min: 0, max: 5000, unidad: 'MVA' },
  cargabilidad_pct: { min: 0, max: 1000, unidad: '%' },
};

// ── Argumentos ──────────────────────────────────────────────────────────────
const USO = 'uso: node herramientas/sellos-de-calidad.mjs <carpeta-del-paso-2> [--sellos <carpeta-del-paso-1>] [--json <ruta>]';
const args = process.argv.slice(2);
const principales = []; const deSellos = []; let rutaJson = null;
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === '--sellos' || a === '--json') {
    const v = args[i + 1];
    if (!v || v.startsWith('--')) { console.error(`❌ «${a}» necesita una ruta detrás.\n${USO}`); process.exit(2); }
    if (a === '--sellos') deSellos.push(v); else rutaJson = v;
    i += 1; continue;
  }
  if (a.startsWith('--')) { console.error(`❌ opción desconocida «${a}».\n${USO}`); process.exit(2); }
  principales.push(a);
}
if (principales.length !== 1) { console.error(USO); process.exit(2); }
const [carpeta] = principales;
for (const c of [carpeta, ...deSellos]) {
  if (!existsSync(c) || !statSync(c).isDirectory()) { console.error(`❌ «${c}» no es una carpeta.`); process.exit(2); }
}
if (rutaJson && existsSync(rutaJson)) {
  console.error(`❌ «${rutaJson}» ya existe. No se sobrescribe: use otra ruta.`);
  process.exit(2);
}
// ⚠️ El listado lleva las etiquetas TAL CUAL —subestación y bahía del cliente—, y
// este repositorio es público (`CLAUDE.md §3.1`): dentro de él no se escribe.
// Se compara la ruta REAL (enlaces resueltos) y sin mayúsculas: el disco de la Mac no las distingue,
// y «/users/…/MANTENIMIENTO-…» apuntaba al mismo repositorio pasando el freno.
const real = (p) => { let r = resolve(p); const cola = []; while (!existsSync(r)) { cola.unshift(basename(r)); r = dirname(r); } return join(realpathSync(r), ...cola); };
const REPO = real(resolve(dirname(fileURLToPath(import.meta.url)), '..')).toLowerCase();
if (rutaJson && (real(rutaJson).toLowerCase() + sep).startsWith(REPO + sep)) {
  console.error(`❌ «${rutaJson}» cae dentro del repositorio, que es público, y el listado lleva nombres de `
    + 'la bahía. Escríbalo fuera (la bóveda o la carpeta de los datos).');
  process.exit(2);
}

// ── Lectura ─────────────────────────────────────────────────────────────────
function archivos(raiz) {
  const out = [];
  for (const n of readdirSync(raiz).filter((x) => !x.startsWith('.')).sort()) {
    const p = join(raiz, n);
    if (statSync(p).isDirectory()) out.push(...archivos(p));
    else if (/\.csv$/i.test(n)) out.push(p);
  }
  return out;
}

/** Hora absoluta: permite ver que las 23 h de un día y las 0 h del siguiente van seguidas. */
const ordinal = (fecha, hora) => Date.parse(`${fecha}T00:00:00Z`) / 3600000 + hora;
const deOrdinal = (o) => {
  const d = new Date(Math.floor(o / 24) * 86400000);
  return { fecha: d.toISOString().slice(0, 10), hora: ((o % 24) + 24) % 24 };
};

/** La etiqueta de una fila, compuesta como la compone el lector (`leerSenales`). */
const etiquetaDe = (celdas, primeraColumna) => (celdas ?? []).slice(0, primeraColumna)
  .map((v) => (v == null ? '' : String(v).trim())).filter((t) => t !== '').join(' · ') || '(sin etiqueta)';

// sellos:  el índice del núcleo — hora·señal → los sellos que trajo (más de uno
//          = dos archivos que no coinciden). La cuenta es SUYA, no de aquí.
// valores: estadístico → etiqueta → ordinal → número | null (celda con texto)
const indiceSellos = indiceDeSellos();
const valores = new Map();
const apartados = [];
const choques = [];
const ordenes = [];
let leidos = 0; let deCalidad = 0; let deMedida = 0; let ignorados = 0;

const lotes = [
  ...archivos(carpeta).map((p) => ({ p, raiz: carpeta, soloSellos: false })),
  ...deSellos.flatMap((r) => archivos(r).map((p) => ({ p, raiz: r, soloSellos: true }))),
];
for (const { p, raiz, soloSellos } of lotes) {
  const nombre = basename(p);
  const ruta = relative(raiz, p);
  const calidad = esArchivoDeCalidad(nombre);
  // De la carpeta de sellos no se leen medidas: los valores salen de la principal.
  if (soloSellos && !calidad) { ignorados += 1; continue; }
  const apartar = (porQue) => apartados.push({ archivo: ruta, carpeta: raiz, porQue });

  let est = null;
  if (!calidad) {
    est = estadisticoDeNombre(nombre).id;
    if (!est) { apartar('el nombre no dice qué estadístico trae'); continue; }
  }
  const texto = readFileSync(p, 'utf8').replace(/^﻿/, '');
  const matriz = celdasDeCsv(texto, { separador: separadorDe(texto) });
  // Para el sello, el mismo mínimo de columnas con que lo lee el núcleo (`leerCalidad`).
  const eje = encontrarEjeDeTiempo(matriz, calidad ? { minimo: 2 } : {});
  if (!eje) { apartar('no trae un eje de tiempo reconocible'); continue; }
  // El mismo criterio y el MISMO texto que el núcleo, que es quien lo guarda:
  // dos redacciones del mismo problema son dos problemas para quien lee.
  if (ejeConHorasRepetidas(eje)) { apartar(MOTIVO_EJE_NO_HORARIO); continue; }
  const instantes = eje.instantes.map((i) => (i ? ordinal(i.fecha, i.hora) : null));
  ordenes.push({ nombre: ruta, orden: eje.ordenDeFecha });
  leidos += 1;
  if (calidad) deCalidad += 1; else deMedida += 1;

  for (const celdas of matriz.slice(eje.fila + 1)) {
    const datos = eje.columnas.map((c) => celdas?.[c]);
    if (datos.every((v) => v == null || String(v).trim() === '')) continue;   // fila vacía o nota
    const etiqueta = etiquetaDe(celdas, eje.primeraColumna);
    datos.forEach((v, k) => {
      const o = instantes[k];
      if (o == null || v == null || String(v).trim() === '') return;
      if (calidad) {
        // QUIÉN CUENTA: el núcleo. Que la misma hora·señal leída dos veces valga
        // UNA, y que dos lecturas distintas sean un choque, lo decide él —y con
        // él lo decide la pantalla—. Aquí solo se le pasa lo leído.
        const instante = eje.instantes[k];
        const fue = indiceSellos.anotar({ ...instante, etiqueta, sello: String(v).trim(), archivo: ruta });
        // El choque SÍ se nombra con su señal: este informe sale del repositorio
        // público, a la bóveda, y ahí la etiqueta es con lo que se busca el archivo.
        if (fue === 'choque') choques.push({ tipo: 'sello', ...deOrdinal(o), etiqueta, archivo: ruta });
        return;
      }
      const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
      const valor = Number.isFinite(n) ? n : null;
      if (!valores.has(est)) valores.set(est, new Map());
      if (!valores.get(est).has(etiqueta)) valores.get(est).set(etiqueta, new Map());
      const serie = valores.get(est).get(etiqueta);
      if (serie.has(o) && serie.get(o) !== valor) {
        choques.push({ tipo: 'valor', estadistico: est, ...deOrdinal(o), etiqueta, archivo: ruta });
        return;   // manda el primero leído; el choque se DICE
      }
      serie.set(o, valor);
    });
  }
}

// ── El índice del núcleo, traído al espacio de horas absolutas de este informe ─
// La CUENTA ya está hecha —cada hora·señal una vez, los choques aparte—; esto
// solo la vuelve a colocar por hora absoluta, que es como se miran aquí las
// rachas y los bloques seguidos. Ni se recuenta ni se juzga nada de nuevo.
/** ordinal → Map(etiqueta → Set(sello)) */
const sellos = new Map();
for (const h of indiceSellos.horaSenal()) {
  const o = ordinal(h.fecha, h.hora);
  if (!sellos.has(o)) sellos.set(o, new Map());
  sellos.get(o).set(h.etiqueta, new Set(h.sellos));
}

// ── ¿Día/mes o mes/día? La regla de la carga entera es la del núcleo ─────────
const carga = ordenDeLaCarga(ordenes);
if (carga.mezcla) {
  console.log(`❌ NO SE INFORMA NADA: ${carga.porQue}.`);
  console.log('   Un bloque fechado al revés señalaría el día equivocado.');
  process.exit(1);
}

// ── Cobertura: qué hora·señal trae valor y cuál trae sello ────────────────────
/** hora·señal con AL MENOS un número en algún estadístico. */
const conValor = new Map();   // ordinal → Set(etiqueta)
for (const porSenal of valores.values()) {
  for (const [etiqueta, serie] of porSenal) {
    for (const [o, v] of serie) {
      if (v == null) continue;
      if (!conValor.has(o)) conValor.set(o, new Set());
      conValor.get(o).add(etiqueta);
    }
  }
}
const diaDe = (o) => deOrdinal(o).fecha;
const diasConValores = new Set([...conValor.keys()].map(diaDe));
const diasConSello = new Set([...sellos.keys()].map(diaDe));
const senalesConSelloPorDia = new Map();
for (const [o, porSenal] of sellos) {
  const f = diaDe(o);
  if (!senalesConSelloPorDia.has(f)) senalesConSelloPorDia.set(f, new Set());
  for (const e of porSenal.keys()) senalesConSelloPorDia.get(f).add(e);
}
const diasSinSello = [...diasConValores].filter((f) => !diasConSello.has(f)).sort();
const diasConSelloSinValores = [...diasConSello].filter((f) => !diasConValores.has(f)).sort();
const senalDiasSinSello = [];
{
  const vistos = new Set();
  for (const [o, etiquetas] of [...conValor].sort((a, b) => a[0] - b[0])) {
    const f = diaDe(o);
    if (!diasConSello.has(f)) continue;   // ya va en «días sin sello»
    for (const e of etiquetas) {
      const k = `${f}|${e}`;
      if (!senalesConSelloPorDia.get(f).has(e) && !vistos.has(k)) { vistos.add(k); senalDiasSinSello.push({ fecha: f, etiqueta: e }); }
    }
  }
}
let horasConValorSinSello = 0;
for (const [o, etiquetas] of conValor) {
  for (const e of etiquetas) if (!sellos.get(o)?.has(e)) horasConValorSinSello += 1;
}

// ── Horas que NO son «Actual», y sus bloques ─────────────────────────────────
let horasActual = 0;
const horasPorSello = {};
const malas = new Map();   // ordinal → [{etiqueta, sello}]
for (const [o, porSenal] of sellos) {
  for (const [etiqueta, s] of porSenal) {
    if (s.size === 1 && s.has(CALIDAD_BUENA)) { horasActual += 1; continue; }
    // Dos archivos que no coinciden: se enseñan los dos sellos, y basta uno malo.
    const sello = [...s].sort().join(' / ');
    horasPorSello[sello] = (horasPorSello[sello] ?? 0) + 1;
    if (!malas.has(o)) malas.set(o, []);
    malas.get(o).push({ etiqueta, sello });
  }
}
const horasMalas = [...malas.keys()].sort((a, b) => a - b);
const tramos = [];
for (const o of horasMalas) {
  const ultimo = tramos[tramos.length - 1];
  if (ultimo && o === ultimo.fin + 1) ultimo.fin = o; else tramos.push({ inicio: o, fin: o });
}

/** La racha más larga de valores idénticos dentro de `[desde, hasta]` de una serie. */
function rachaIgual(serie, desde, hasta) {
  let mejor = { horas: 0 }; let actual = null;
  for (let o = desde; o <= hasta; o += 1) {
    const v = serie.get(o);
    if (v == null) { actual = null; continue; }
    if (actual && actual.valor === v) { actual.hasta = o; actual.horas += 1; } else actual = { valor: v, desde: o, hasta: o, horas: 1 };
    if (actual.horas > mejor.horas) mejor = { ...actual };
  }
  return mejor;
}

/** Horas sueltas → tramos seguidos: [1,2,3,16] → [[1,3],[16,16]]. */
function tramosDe(horas) {
  const out = [];
  for (const h of [...horas].sort((a, b) => a - b)) {
    const u = out[out.length - 1];
    if (u && h === u[1] + 1) u[1] = h; else out.push([h, h]);
  }
  return out;
}

const bloques = tramos.map(({ inicio, fin }) => {
  const senales = new Set();
  const sellosDelBloque = {};
  const porSenal = new Map();   // etiqueta → Map(sello → [ordinales])
  for (let o = inicio; o <= fin; o += 1) {
    for (const { etiqueta, sello } of malas.get(o) ?? []) {
      senales.add(etiqueta);
      sellosDelBloque[sello] = (sellosDelBloque[sello] ?? 0) + 1;
      if (!porSenal.has(etiqueta)) porSenal.set(etiqueta, new Map());
      const m = porSenal.get(etiqueta);
      if (!m.has(sello)) m.set(sello, []);
      m.get(sello).push(o);
    }
  }
  const porDiaYSenal = [];
  for (const [etiqueta, m] of porSenal) {
    for (const [sello, ords] of m) {
      const porDia = new Map();
      for (const o of ords) {
        const { fecha, hora } = deOrdinal(o);
        if (!porDia.has(fecha)) porDia.set(fecha, []);
        porDia.get(fecha).push(hora);
      }
      for (const [fecha, horas] of porDia) porDiaYSenal.push({ fecha, etiqueta, sello, horas });
    }
  }
  porDiaYSenal.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.etiqueta.localeCompare(b.etiqueta)
    || a.sello.localeCompare(b.sello));

  // Los valores de cada serie en SUS horas malas (no en las de otra señal).
  const series = [];
  const fueraDeRango = [];
  for (const [est, porEtiqueta] of [...valores].sort((a, b) => a[0].localeCompare(b[0]))) {
    for (const etiqueta of [...senales].sort()) {
      const serie = porEtiqueta.get(etiqueta);
      if (!serie) continue;
      const suyas = [...porSenal.get(etiqueta).values()].flat().sort((a, b) => a - b);
      const conNumero = suyas.filter((o) => serie.get(o) != null);
      if (!conNumero.length) continue;
      // Congelado: por cada tramo seguido de horas malas, desde la hora anterior.
      let mejor = { horas: 0 }; let ventana = 0; let repiteLaAnterior = false;
      for (const [a, b] of tramosDe(suyas)) {
        const r = rachaIgual(serie, a - 1, b);
        if (r.horas > mejor.horas) mejor = r;
        ventana = Math.max(ventana, b - a + 2);
        if (serie.get(a) != null && serie.get(a) === serie.get(a - 1)) repiteLaAnterior = true;
      }
      series.push({
        estadistico: est, etiqueta, horasConValor: conNumero.length,
        horasIguales: mejor.horas,
        valor: mejor.horas ? mejor.valor : null,
        desde: mejor.horas ? deOrdinal(mejor.desde) : null,
        hasta: mejor.horas ? deOrdinal(mejor.hasta) : null,
        congelada: mejor.horas >= HORAS_IGUALES_PARA_CONGELADO,
        // Con menos horas que el umbral no se puede decir «congelado»: se dice
        // solo si la primera hora mala repite EXACTAMENTE la hora anterior.
        juzgable: ventana >= HORAS_IGUALES_PARA_CONGELADO,
        repiteLaAnterior,
      });
      const rango = RANGO_FISICO[campoDeSenal(etiqueta)?.campo];
      if (!rango) continue;
      for (const o of conNumero) {
        const v = serie.get(o);
        if (v < rango.min || v > rango.max) fueraDeRango.push({ estadistico: est, etiqueta, ...deOrdinal(o), valor: v, rango });
      }
    }
  }
  return {
    inicio: deOrdinal(inicio), fin: deOrdinal(fin), horas: fin - inicio + 1,
    senales: [...senales].sort(), sellos: sellosDelBloque, porDiaYSenal,
    valores: {
      series: series.length,
      congeladas: series.filter((s) => s.congelada).length,
      juzgables: series.filter((s) => s.juzgable).length,
      repitenLaAnterior: series.filter((s) => s.repiteLaAnterior).length,
      fueraDeRango: fueraDeRango.length,
      detalleSeries: series,
      detalleFueraDeRango: fueraDeRango,
    },
  };
});
const diasAfectados = [...new Set(horasMalas.map(diaDe))].sort();

// ── Nombres cortos para la consola: se quita lo que TODAS las etiquetas comparten ─
const todas = [...new Set([
  ...[...sellos.values()].flatMap((m) => [...m.keys()]),
  ...[...valores.values()].flatMap((m) => [...m.keys()]),
])];
const corto = new Map();
{
  const partes = todas.map((e) => e.split('/').map((s) => s.replace(/\s+/g, ' ').trim()));
  let ini = 0; let fin = 0;
  if (partes.length > 1) {
    while (partes.every((p) => p.length > ini + 1 && p[ini] === partes[0][ini])) ini += 1;
    while (partes.every((p) => p.length - fin - 1 > ini
      && p[p.length - 1 - fin] === partes[0][partes[0].length - 1 - fin])) fin += 1;
  }
  todas.forEach((e, i) => corto.set(e, partes[i].slice(ini, partes[i].length - fin).filter(Boolean).join('/') || e));
  // Dos etiquetas que acortadas se confunden se enseñan enteras.
  const cuenta = new Map();
  for (const c of corto.values()) cuenta.set(c, (cuenta.get(c) ?? 0) + 1);
  for (const [e, c] of corto) if (cuenta.get(c) > 1) corto.set(e, e.replace(/\s+/g, ' '));
}
const nom = (e) => corto.get(e) ?? e;

// ── Informe ─────────────────────────────────────────────────────────────────
const n = (x) => x.toLocaleString('es-CO');
const dm = ({ fecha }) => `${fecha.slice(8, 10)}-${fecha.slice(5, 7)}`;
const instante = (i) => `${i.fecha} ${i.hora} h`;
const horasTexto = (horas) => `${tramosDe(horas).map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(', ')} h`;
const lista = (xs, tope = 12) => xs.slice(0, tope).join(', ') + (xs.length > tope ? ` … (+${xs.length - tope})` : '');

console.log('SELLOS DE CALIDAD — solo lectura: no aparta ni decide nada, informa');
console.log(`   carpeta: ${carpeta}${deSellos.length ? ` · sellos también de: ${deSellos.join(', ')}` : ''}`);
console.log(`   ${leidos} archivo(s) leídos: ${deMedida} de valores y ${deCalidad} de sello`
  + `${ignorados ? ` (${ignorados} de medida en la carpeta de sellos, sin leer: los valores salen de la principal)` : ''}`);
console.log(`   fecha: ${carga.porQue}`);

console.log(`\n${diasConValores.size} día(s) con valores · ${diasConSello.size} con sello`);
if (!diasConSello.size) {
  console.log('\n❌ NINGÚN ARCHIVO DE SELLO. Ninguna hora se puede dar por medida.');
  console.log('   El paso 2 aparta los `_quality`: páselos con --sellos <carpeta del paso 1, la de la bahía>.');
  process.exitCode = 1;
}
if (diasSinSello.length) {
  console.log(`   ⚠️ ${diasSinSello.length} día(s) SIN SELLO —no se dan por «Actual»—: ${lista(diasSinSello)}`);
}
if (senalDiasSinSello.length) {
  console.log(`   ⚠️ ${senalDiasSinSello.length} señal·día con valores y SIN SELLO (el día sí trae sello de otras señales):`);
  for (const s of senalDiasSinSello.slice(0, 20)) console.log(`      ${s.fecha} · ${nom(s.etiqueta)}`);
  if (senalDiasSinSello.length > 20) console.log(`      … (+${senalDiasSinSello.length - 20})`);
}
if (diasConSelloSinValores.length) {
  console.log(`   ${diasConSelloSinValores.length} día(s) con sello y sin valores en la carpeta: ${lista(diasConSelloSinValores)}`);
}
const horasNoActual = Object.values(horasPorSello).reduce((a, b) => a + b, 0);
console.log(`\nhora·señal: ${n(horasActual)} «${CALIDAD_BUENA}» · ${n(horasNoActual)} NO «${CALIDAD_BUENA}»`
  + ` · ${n(horasConValorSinSello)} con valor y sin sello`);
if (Object.keys(horasPorSello).length) {
  console.log(`   por sello: ${Object.entries(horasPorSello).sort((a, b) => b[1] - a[1]).map(([s, k]) => `${s} ${n(k)}`).join(' · ')}`);
}

console.log(`\n${bloques.length} BLOQUE(S) de horas que NO son «${CALIDAD_BUENA}» · ${diasAfectados.length} día(s) afectados`
  + `${diasAfectados.length ? `: ${lista(diasAfectados)}` : ''}`);
console.log(`   (congelado = ${HORAS_IGUALES_PARA_CONGELADO} h seguidas o más con el MISMO valor, contando la hora anterior al sello;`
  + ' fuera de rango = cifra que ninguna línea de AT puede dar)');
bloques.forEach((b, i) => {
  console.log(`\n${i + 1}) ${instante(b.inicio)} → ${instante(b.fin)} · ${b.horas} h · ${b.senales.length} señal(es): `
    + b.senales.map(nom).join(', '));
  console.log(`   sello: ${Object.entries(b.sellos).map(([s, k]) => `${s} ×${k}`).join(' · ')} (hora·señal)`);
  console.log('   por día y señal:');
  for (const x of b.porDiaYSenal) console.log(`      ${x.fecha} · ${nom(x.etiqueta)} · ${x.sello} · ${horasTexto(x.horas)}`);
  const v = b.valores;
  if (!v.series) {
    console.log('   valores: ninguno en esas horas dentro de la carpeta — no hay qué mirar');
    return;
  }
  if (!v.juzgables) {
    console.log(`   valores: bloque CORTO para juzgar congelado (hacen falta ${HORAS_IGUALES_PARA_CONGELADO} h seguidas`
      + ` contando la anterior); ${v.repitenLaAnterior} de ${v.series} serie(s) repiten exactamente el valor de la hora anterior`);
  } else {
    console.log(`   valores CONGELADOS: ${v.congeladas} de ${v.series} serie(s) estadístico·señal`
      + `${v.juzgables < v.series ? ` (${v.series - v.juzgables} con tramos demasiado cortos para juzgar)` : ''}`);
  }
  const porEst = new Map();
  for (const s of v.detalleSeries.filter((x) => x.congelada)) {
    if (!porEst.has(s.estadistico)) porEst.set(s.estadistico, []);
    const mismoDia = s.desde.fecha === s.hasta.fecha;
    porEst.get(s.estadistico).push(`${nom(s.etiqueta)} = ${s.valor} (${mismoDia ? `${s.desde.hora}-${s.hasta.hora} h`
      : `${dm(s.desde)} ${s.desde.hora} h → ${dm(s.hasta)} ${s.hasta.hora} h`}, ${s.horasIguales} h)`);
  }
  for (const [est, xs] of porEst) console.log(`      ${est}: ${xs.join(' · ')}`);
  if (!v.fueraDeRango) console.log('   fuera de rango físico evidente: ninguno');
  else {
    console.log(`   ❗ FUERA DE RANGO FÍSICO EVIDENTE: ${v.fueraDeRango} valor(es)`);
    const peores = [...v.detalleFueraDeRango].sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor)).slice(0, 5);
    for (const x of peores) {
      console.log(`      ${x.fecha} ${x.hora} h · ${x.estadistico} · ${nom(x.etiqueta)} = ${x.valor} ${x.rango.unidad}`
        + ` (admite ${x.rango.min} a ${x.rango.max})`);
    }
  }
});

if (choques.length) {
  console.log(`\n❌ ${choques.length} CHOQUE(S): la misma señal y la misma hora con dos lecturas distintas en archivos distintos.`);
  console.log('   Sellos: se enseñan los dos. Valores: manda el primero leído. Revise:');
  for (const c of choques.slice(0, 10)) {
    console.log(`   ${c.fecha} ${c.hora} h · ${c.tipo}${c.estadistico ? ` ${c.estadistico}` : ''} · ${nom(c.etiqueta)} · «${c.archivo}»`);
  }
  if (choques.length > 10) console.log(`   … (+${choques.length - 10})`);
  process.exitCode = 1;
}
if (apartados.length) {
  console.log(`\n❌ ${apartados.length} archivo(s) APARTADOS sin leer: lo que traigan NO está en este informe.`);
  for (const a of apartados) console.log(`   «${a.archivo}» · ${a.porQue}`);
  process.exitCode = 1;
}

if (rutaJson) {
  const informe = {
    herramienta: 'sellos-de-calidad',
    formato: 1,
    carpeta,
    carpetasDeSellos: deSellos,
    umbrales: { horasIgualesParaCongelado: HORAS_IGUALES_PARA_CONGELADO, rangoFisico: RANGO_FISICO },
    ordenDeFecha: { orden: carga.orden, seguro: carga.seguro, porQue: carga.porQue },
    resumen: {
      archivosLeidos: leidos, deValores: deMedida, deSello: deCalidad,
      diasConValores: diasConValores.size, diasConSello: diasConSello.size,
      diasSinSello, senalDiasSinSello, diasConSelloSinValores,
      horaSenal: { actual: horasActual, noActual: horasNoActual, conValorSinSello: horasConValorSinSello },
      horasPorSello,
      diasAfectados,
      bloques: bloques.length,
      apartados: apartados.length,
      choques: choques.length,
    },
    bloques,
    apartados,
    choques,
  };
  mkdirSync(dirname(rutaJson), { recursive: true });
  writeFileSync(rutaJson, JSON.stringify(informe, null, 2) + '\n', { flag: 'wx' });
  console.log(`\nListado escrito en «${rutaJson}».`);
}
