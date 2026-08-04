// ============================================================================
// datos/clima.ts — la consulta a IDEAM, desde el navegador
// ----------------------------------------------------------------------------
// DÓNDE CORRE, Y POR QUÉ AQUÍ. Va en el navegador y no en un servidor porque
// este proyecto NO tiene cómputo servidor que no facture (ADR-001 descartó
// Cloud Functions por eso). Se comprobó el 2026-08-04 que datos.gov.co responde
// con `Access-Control-Allow-Origin: *`, así que el navegador puede pedirlo
// directamente: cero infraestructura nueva, cero gasto.
//
// SE CONSULTA CUANDO EL INGENIERO LO PIDE, NUNCA AL PINTAR. Un `useEffect` que
// consultara al abrir la pantalla dispararía peticiones a un tercero cada vez
// que alguien mira un análisis, y convertiría un hecho fechado en una
// consulta volátil. Aquí una consulta es un acto deliberado que produce un
// documento.
//
// EL RESULTADO ES UN HECHO FECHADO, NO UNA CACHÉ. Se guarda tal cual se recibió.
// Si mañana IDEAM corrige la serie, el informe firmado tiene que seguir
// mostrando lo que se consultó el día que se firmó — por eso las reglas hacen
// `sondeos_clima` inmutable.
// ============================================================================
import { CONJUNTOS, CATALOGO_ESTACIONES, cajaConsulta, elegirEstacion, ventana, cobertura, redactarNota, resumirSerie }
  from '@lineas/nucleo/clima';

const BASE = 'https://www.datos.gov.co/resource';

async function pedir(conjunto: string, params: Record<string, string>): Promise<Record<string, string>[]> {
  const q = new URLSearchParams(params).toString();
  const r = await fetch(`${BASE}/${conjunto}.json?${q}`, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`IDEAM respondió ${r.status} al pedir ${conjunto}`);
  return r.json();
}

/** El último dato que la fuente tiene publicado. Se MIDE, no se supone. */
async function ultimoDato(conjunto: string): Promise<string | null> {
  const r = await pedir(conjunto, { $order: 'fechaobservacion DESC', $limit: '1' });
  return r[0]?.fechaobservacion ?? null;
}

export interface SondeoResultado {
  estacion: ReturnType<typeof elegirEstacion>;
  desde: string; hasta: string;
  ultimoDatoDisponible: string | null;
  fueraDeVentana: boolean;
  series: { variable: string; conjunto: string; unidad: string; n: number; max: number | null; acumulado: number | null; valores: { t: string; v: number }[] }[];
  nota: string;
}

/**
 * Sondea el clima alrededor de un evento.
 *
 * La estación se busca en una CELDA de rejilla, no con la coordenada exacta del
 * activo: el registro de consultas de un tercero no tiene por qué saber dónde
 * está una torre de un cliente.
 */
export async function sondearClima(lat: number, lon: number, ocurrioEn: string): Promise<SondeoResultado> {
  const caja = cajaConsulta(lat, lon);
  const v = ventana(ocurrioEn);

  // 1 · Estaciones del entorno, del CATÁLOGO — no de una serie de observaciones.
  //     Filtrar veinte millones de lecturas por coordenada agota el tiempo de
  //     espera (comprobado: 90 s sin respuesta); el catálogo contesta en menos
  //     de un segundo. Solo activas: una estación clausurada no midió nada.
  const candidatas = await pedir(CATALOGO_ESTACIONES, {
    $where: `latitud between ${caja.latMin} and ${caja.latMax} and longitud between ${caja.lonMin} and ${caja.lonMax} and estado='Activa'`,
    $select: 'codigo,nombre,categoria,departamento,municipio,latitud,longitud',
    $limit: '500',
  });
  const estacion = elegirEstacion(candidatas, lat, lon);

  // 2 · El desfase de la fuente, medido ahora.
  const ultimo = await ultimoDato(CONJUNTOS.temperatura.id);
  const cob = cobertura(ocurrioEn, ultimo);

  // 3 · Las series, solo si hay estación y el evento cae dentro de lo publicado.
  const series: SondeoResultado['series'] = [];
  if (estacion && !cob.fueraDeVentana) {
    for (const [variable, c] of Object.entries(CONJUNTOS) as [string, { id: string; unidad: string }][]) {
      try {
        const filas = await pedir(c.id, {
          $where: `codigoestacion='${estacion.codigo}' and fechaobservacion between '${v.desde.slice(0, 19)}' and '${v.hasta.slice(0, 19)}'`,
          $select: 'fechaobservacion,valorobservado',
          $order: 'fechaobservacion ASC',
          $limit: '2000',
        });
        const valores = filas
          .map((f) => ({ t: f.fechaobservacion, v: Number(f.valorobservado) }))
          .filter((x) => isFinite(x.v));
        const r = resumirSerie(variable, valores);
        series.push({ variable, conjunto: c.id, unidad: c.unidad, n: r.n, max: r.max, acumulado: r.acumulado, valores });
      } catch {
        // Una variable que falla NO tumba el sondeo: se queda fuera y su
        // ausencia se ve, que es más honesto que un cero.
      }
    }
  }

  return {
    estacion, desde: v.desde, hasta: v.hasta,
    ultimoDatoDisponible: ultimo,
    fueraDeVentana: cob.fueraDeVentana,
    series,
    nota: redactarNota({ estacion, cobertura: cob, ocurrioEn, ultimoDatoDisponible: ultimo }),
  };
}
