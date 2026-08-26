#!/usr/bin/env node
// ============================================================================
// pronostico-caribe.mjs — EL TIEMPO QUE VIENE, sobre las mismas 36 celdas
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE, Y POR QUÉ ROMPE UNA REGLA A PROPÓSITO (`99 §ADR-086`).
//
// El Ingeniero: *«me gustaría tener un atlas que se puedan apreciar los
// pronósticos»*. Este proyecto tenía escrito, en dos sitios y con todas las
// letras, que **un pronóstico no se guarda jamás** —«se pide, se mira y se
// olvida»— y que **no es un mapa**: «el modelo trae celdas de kilómetros: sobre
// 3 km de línea el valor es UNO».
//
// Lo segundo se midió antes de tocar nada, y **no aplica a esta escala**. Ese
// argumento se escribió para la LÍNEA, que mide 3 km. El atlas mide 670. Medido
// el 2026-08-26 en nueve celdas del encuadre: **8,8 °C y 50,8 km/h de diferencia
// dentro del mismo recuadro** —el norte a 47-53 km/h mientras el sur interior no
// pasaba de 8—. Aquí un mapa no finge un detalle inexistente: lo enseña.
//
// Lo primero —guardarlo— **es una decisión del Ingeniero, tomada el 2026-08-26**
// sabiendo lo que costaba: un pronóstico archivado se puede leer dentro de meses
// como si alguien hubiera medido algo. Así que el trabajo de este archivo no es
// solo bajar el dato: es **hacer imposible esa confusión**.
//
// LAS CUATRO COSAS QUE LO HACEN IMPOSIBLE:
//
//   1. La ficha declara `naturaleza: 'pronostico'`. Los ocho atlas medidos
//      declaran `'medida'`, y **un guardián recorre las once y exige que cada
//      una lo diga**: nadie puede añadir una capa sin decir qué es.
//   2. Los archivos se llaman `pron-*` y nunca `*-caribe` a secas. En una
//      carpeta, en un registro de git o en una URL, se distinguen sin abrirlos.
//   3. La ficha lleva `caduca`: la hora a partir de la cual este archivo ya no
//      se puede presentar como el pronóstico de ahora. La pantalla lo dice.
//   4. Ni un número de aquí entra en un cálculo. Igual que el pronóstico de la
//      línea (`vistas/pronostico.ts`): un extremo de diseño no se valida con el
//      tiempo de la semana que viene, y creerlo sería el error caro.
//
// LO QUE SÍ GANA, que es lo que él pidió: **dónde** esperar viento, calor o agua
// en los próximos días, sobre el mismo encuadre y **con las mismas escalas de
// color que los atlas medidos**. Poner «lo que viene» al lado de «lo que pasó»
// solo sirve si se leen igual; por eso los perfiles heredan la rampa y la
// codificación de su gemelo medido en vez de inventar unas propias.
//
// LA FUENTE: MET Norway `locationforecast/2.0/compact`, CC BY 4.0 — uso
// comercial con atribución, sin cuenta ni clave. Verificado en sus términos el
// 2026-08-26: hay que identificarse, máximo 20 consultas/segundo POR APLICACIÓN
// (contando las de los navegadores), coordenadas a 4 decimales como mucho, y
// piden expresamente **no disparar en la hora en punto ni de golpe**. Por eso
// aquí las 36 celdas van de una en una y con pausa, no en paralelo.
//
// ⚠️ EL DETALLE HORARIO SE ACABA ANTES QUE EL PRONÓSTICO. MET da hora a hora los
// primeros ~2,7 días y después bloques de 6 h. Lo que este archivo publica es lo
// que el modelo da y **ni una hora más**: los huecos se quedan huecos (byte 0 =
// SIN DATO). El resumen de cada día SÍ cubre los diez, porque ahí los bloques de
// 6 h valen enteros. Es la misma forma que ya tiene el atlas solar, donde las
// horas llegan a mayo y el total del día a agosto.
//
// Uso:  node herramientas/pronostico-caribe.mjs [--salida web/public/mapas]
// ============================================================================
import { PERFILES, ANCHO, ALTO, OESTE, SUR, publicarAtlas } from './atlas-caribe.mjs';

/** Lo que MET pide que se mande para saber quién consulta. Es su condición. */
const AGENTE = 'mantenimiento-lineas-at/1.0 github.com/PowertransformersMJ/mantenimiento-lineas-at';
const BASE = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';

/**
 * Colombia va a UTC−5 todo el año, sin horario de verano.
 *
 * ⚠️ Y esto NO es un detalle (`32 · L-70`). Los atlas medidos se piden a NASA con
 * `time-standard=LST`, así que sus horas son las del SITIO. Si aquí se guardara
 * la hora UTC de MET, el mapa del pronóstico y el de lo medido estarían
 * desplazados cinco horas y **nada daría error**: se leerían como si el mediodía
 * de uno fuera el de otro.
 */
const HUSO_COLOMBIA_H = -5;

/** `AAAAMMDDHH` en hora de Colombia, que es la clave que usa el motor. */
function claveLocal(iso) {
  const t = new Date(iso);
  const l = new Date(t.getTime() + HUSO_COLOMBIA_H * 3600_000);
  const p = (n) => String(n).padStart(2, '0');
  return `${l.getUTCFullYear()}${p(l.getUTCMonth() + 1)}${p(l.getUTCDate())}${p(l.getUTCHours())}`;
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Una celda del atlas → el punto que se le pregunta a MET.
 *
 * Se pregunta por el CENTRO de la celda, no por su esquina: la esquina de una
 * celda de 111 km es un punto que puede caer en el mar cuando la celda es de
 * tierra. Y se trunca a 4 decimales porque sus términos dicen que con 5 o más
 * devuelven 403.
 */
function puntoDe(fx, fy) {
  return { lon: +(OESTE + fx + 0.5).toFixed(4), lat: +(SUR + fy + 0.5).toFixed(4) };
}

async function pedirCelda(fx, fy, intentos = 3) {
  const { lon, lat } = puntoDe(fx, fy);
  for (let i = 1; i <= intentos; i++) {
    try {
      const r = await fetch(`${BASE}?lat=${lat}&lon=${lon}`, { headers: { 'User-Agent': AGENTE } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i === intentos) throw new Error(`celda ${fx},${fy} (${lat}/${lon}): ${e.message}`);
      await dormir(2000 * i);
    }
  }
  return null;
}

/**
 * QUÉ SE SACA DE CADA TRAMO, y por qué la lluvia no se saca igual.
 *
 * Temperatura y viento son valores INSTANTÁNEOS: existen en todos los tramos,
 * también en los de 6 h, y se pueden clavar en su hora sin más.
 *
 * La lluvia NO. MET la publica acumulada: `next_1_hours` son los milímetros de
 * ESA hora y `next_6_hours` los de seis. Meter un acumulado de 6 h en una casilla
 * horaria lo multiplicaría por seis y saldría un aguacero que nadie ha
 * pronosticado — es exactamente el fallo del factor `1/24` que ya mordió con
 * NASA. Así que en el mapa horario la lluvia solo entra donde MET da la hora, y
 * los bloques de 6 h se usan **solo** para el total del día, donde valen enteros.
 */
const LECTORES = {
  temperatura: {
    horario: (t) => t.data.instant?.details?.air_temperature ?? null,
    delDia: 'maxima',
    aporteDiario: (t) => {
      const v = t.data.instant?.details?.air_temperature;
      return Number.isFinite(v) ? [v] : [];
    },
  },
  viento: {
    horario: (t) => {
      const v = t.data.instant?.details?.wind_speed;
      return Number.isFinite(v) ? v * 3.6 : null;      // m/s → km/h
    },
    delDia: 'maxima',
    aporteDiario: (t) => {
      const v = t.data.instant?.details?.wind_speed;
      return Number.isFinite(v) ? [v * 3.6] : [];
    },
  },
  lluvia: {
    // Solo la hora que MET da como hora. Ver el comentario de arriba.
    horario: (t) => t.data.next_1_hours?.details?.precipitation_amount ?? null,
    delDia: 'suma',
    // Para el total del día valen los dos: la hora suelta y el bloque de 6 h.
    // Se prefiere el de 1 h cuando existe, para no contar el mismo agua dos veces.
    aporteDiario: (t) => {
      const h = t.data.next_1_hours?.details?.precipitation_amount;
      if (Number.isFinite(h)) return [h];
      const s = t.data.next_6_hours?.details?.precipitation_amount;
      return Number.isFinite(s) ? [s] : [];
    },
  },
};

/** La mediana, que es como resumen la región los atlas medidos. */
function mediana(xs) {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

/**
 * Los tres perfiles, DERIVADOS de su gemelo medido.
 *
 * Heredan rampa y codificación a propósito: si el pronóstico usara una escala
 * propia, poner los dos mapas uno al lado del otro no diría nada — un rojo aquí
 * y un rojo allá serían números distintos. Lo que cambia es lo que tiene que
 * cambiar: de dónde viene, qué es y qué no se puede hacer con él.
 */
function perfilDe(clave, extra) {
  const base = PERFILES[clave];
  return Object.freeze({
    ...base,
    ...extra,
    naturaleza: 'pronostico',
    // A partir de aquí el archivo ya no es «el pronóstico de ahora». El vigía lo
    // rehace cada 4 h; con 8 se tolera una corrida perdida y no dos.
    caducaEn_h: 8,
    // ⚠️ SIN NI UNA COMA, y no es estilo. La cinta de arriba publica el nombre
    // corto de la fuente cortando por la PRIMERA COMA (`§ADR-080`). Con
    // «(modelo, NO medición)» la cinta enseñaba «MET Norway · locationforecast
    // 2.0 (modelo» — un paréntesis abierto y la palabra que más importa,
    // «medición», cortada. Lo cazó la foto del portero, no una prueba.
    fuente: 'MET Norway · locationforecast 2.0 (modelo — no es una medición)',
    atribucion: 'Pronóstico: MET Norway (CC BY 4.0)',
    licencia: 'CC BY 4.0 — uso comercial permitido con atribución',
    // ⚠️ La hipótesis NO se marca en la rampa de ningún pronóstico, ni siquiera
    // donde el gemelo medido la marca (la temperatura marca sus 32 °C). Marcar
    // un criterio de diseño sobre un modelo invita justo a la lectura prohibida:
    // «el jueves no llega a 32, luego la hipótesis va sobrada».
    hipotesisMarcadaEnRampa: undefined,
    etiquetaHipotesis: undefined,
  });
}

const AVISO_COMUN = 'ESTO ES UN PRONÓSTICO: un modelo diciendo qué cree que va a pasar, no una '
  + 'medición. NO entra en ningún cálculo de la línea y NO valida ninguna hipótesis de diseño — '
  + 'un extremo con periodo de retorno de decenas de años no se comprueba con el tiempo de la '
  + 'semana que viene, y creerlo sería el error caro. Sirve para DECIDIR LA SEMANA: dónde va a '
  + 'soplar, dónde va a llover y dónde va a apretar el calor. Hora a hora los primeros días y '
  + 'después cada 6 h, que es lo que publica el modelo: las horas que faltan se quedan en hueco '
  + 'en vez de rellenarse.';

export const PERFILES_PRONOSTICO = Object.freeze({
  temperatura: perfilDe('temperatura', {
    capa: 'pron-temp-caribe',
    prefijo: 'pron-temp-caribe',
    titulo: 'Temperatura del aire que se espera en el Caribe',
    resumenDiarioEtiqueta: 'Máxima que se espera',
    resumenDiarioUnidad: '°C (mediana regional de la máxima del día)',
    resumenDiarioAviso: 'Es la máxima pronosticada en cada celda, resumida por la mediana de las 36.',
    aviso: `${AVISO_COMUN} Es la temperatura del AIRE a 2 m — la misma magnitud que el atlas medido `
      + 'de temperatura, para poder mirarlos seguidos.',
  }),
  viento: perfilDe('viento', {
    capa: 'pron-viento-caribe',
    prefijo: 'pron-viento-caribe',
    titulo: 'Viento que se espera en el Caribe',
    resumenDiarioEtiqueta: 'Máximo que se espera',
    resumenDiarioUnidad: 'km/h (mediana regional del máximo del día)',
    resumenDiarioAviso: 'Es el máximo pronosticado en cada celda, resumido por la mediana de las 36: '
      + 'la celda más ventosa de ese día tendrá más.',
    aviso: `${AVISO_COMUN} El viento es carga sobre la estructura y es seguridad de la cuadrilla: `
      + 'de los tres, es el que más decide si se sube o no se sube.',
  }),
  lluvia: perfilDe('lluvia', {
    capa: 'pron-lluvia-caribe',
    prefijo: 'pron-lluvia-caribe',
    titulo: 'Lluvia que se espera en el Caribe',
    resumenDiarioEtiqueta: 'Total que se espera',
    resumenDiarioUnidad: 'mm en el día (mediana regional)',
    resumenDiarioAviso: 'Es el total pronosticado en cada celda, resumido por la mediana de las 36.',
    aviso: `${AVISO_COMUN} En el mapa horario solo aparecen las horas que MET publica como hora; `
      + 'los bloques de 6 h no se reparten entre sus horas —eso multiplicaría el agua por seis— y '
      + 'se usan solo para el total del día.',
  }),
});

// ════════════════════════════════════════════════════════════════════════════

async function construir({ salida }) {
  console.log(`🌦️  pidiendo el pronóstico de las ${ANCHO * ALTO} celdas a MET Norway…`);
  const series = new Map();                    // "fx,fy" → timeseries
  for (let fy = 0; fy < ALTO; fy++) {
    for (let fx = 0; fx < ANCHO; fx++) {
      const j = await pedirCelda(fx, fy);
      series.set(`${fx},${fy}`, j.properties.timeseries);
      // Una pausa corta entre celdas. Sus términos piden repartir el tráfico y
      // no dispararlo de golpe; 36 consultas seguidas sin pausa es justo eso.
      await dormir(150);
    }
    console.log(`   fila ${fy + 1}/${ALTO} lista`);
  }

  const ejemplo = series.get('0,0');
  console.log(`   ${ejemplo.length} tramos por celda · de ${ejemplo[0].time} a ${ejemplo[ejemplo.length - 1].time}`);

  // ⚠️ EL AÑO. El motor empaqueta por meses DE UN AÑO: un pronóstico que cruzara
  // el 31 de diciembre perdería sus días de enero sin dar un solo error. Se
  // comprueba y se para, que es lo que hay que hacer con un fallo silencioso.
  const anio = Number(claveLocal(ejemplo[0].time).slice(0, 4));
  const anioFin = Number(claveLocal(ejemplo[ejemplo.length - 1].time).slice(0, 4));
  if (anio !== anioFin) {
    throw new Error(`el pronóstico cruza de ${anio} a ${anioFin} y el motor empaqueta por meses `
      + 'de UN año: los días del año siguiente se perderían en silencio.');
  }

  for (const [clave, lector] of Object.entries(LECTORES)) {
    const perfil = PERFILES_PRONOSTICO[clave];
    const celdas = new Map();
    const porDiaCelda = new Map();             // "AAAA-MM-DD" → Map(celda → [valores])

    for (const [c, tramos] of series) {
      const serie = {};
      for (const t of tramos) {
        const k = claveLocal(t.time);
        const v = lector.horario(t);
        if (Number.isFinite(v)) serie[k] = v;

        const d = `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`;
        if (!porDiaCelda.has(d)) porDiaCelda.set(d, new Map());
        const m = porDiaCelda.get(d);
        if (!m.has(c)) m.set(c, []);
        m.get(c).push(...lector.aporteDiario(t));
      }
      celdas.set(c, serie);
    }

    // El resumen del día: se resume PRIMERO dentro de cada celda —máxima o
    // total, según el producto— y solo después se saca la mediana de las 36. Al
    // revés (mediana de todas las horas de todas las celdas) daría un número
    // distinto y sin significado, y es el orden que usan los atlas medidos.
    const diario = [...porDiaCelda.entries()].sort().map(([d, porCelda]) => {
      const porCeldaResumida = [...porCelda.values()]
        .filter((vs) => vs.length)
        .map((vs) => (lector.delDia === 'suma'
          ? vs.reduce((a, b) => a + b, 0)
          : Math.max(...vs)));
      const v = mediana(porCeldaResumida);
      return v === null ? null : { d, v: +v.toFixed(2) };
    }).filter(Boolean);

    console.log(`\n── ${perfil.titulo}`);
    publicarAtlas(perfil, celdas, diario, { salida, anio });
  }
}

const iSal = process.argv.indexOf('--salida');
const salida = iSal > 0 ? process.argv[iSal + 1] : 'web/public/mapas';
construir({ salida }).catch((e) => { console.error('\n❌', e.message); process.exit(1); });
