// ============================================================================
// componentes/Exportar.tsx — la pestaña Exportar
// ----------------------------------------------------------------------------
// Réplica de la pestaña del módulo original (GPX 1.1 · KML · CSV), con la
// diferencia de fondo del ADR-005/006: los archivos se generan DESDE LOS
// DATOS, jamás desde la pantalla, por el paquete puro @lineas/exportar
// (hermano de nucleo/). Aquí no hay ni una fórmula ni un formato: React solo
// pinta botones y pide el texto.
//
// El CSV sale en DOS dialectos porque uno solo miente en alguno: el de Excel
// es-CO (coma decimal) y el de datos RFC 4180 (QGIS/pandas). Hallazgo de la
// auditoría 2026-07-30, heredado del original y corregido aquí.
//
// El informe fotográfico y guardar/cargar proyecto del original llegan con la
// captura de campo (F4): dependen de fotos y notas que este sistema aún no
// tiene, y aquí no se finge nada.
// ============================================================================
import nucleoPkg from '@lineas/nucleo/package.json';
import { useMemo, useState } from 'react';
import type { Apoyo, Conductor, Hipotesis, Investigacion, Linea as TLinea } from '@lineas/contratos';
import { derivarLevantamiento } from '@lineas/exportar/levantamiento';
import { generarGpx } from '@lineas/exportar/gpx';
import { generarKml } from '@lineas/exportar/kml';
import { generarCsv } from '@lineas/exportar/csv';
import { csvVerificacionMecanica } from '@lineas/exportar/mecanica';
import { csvCantidades } from '@lineas/exportar/bom';
import { ampacidadDeLinea } from '@lineas/nucleo/termica';
import { informeHtml } from '@lineas/exportar/informe';
import { gerencialHtml } from '@lineas/exportar/gerencial';
import { tramosDeTension, estadosDelTramo } from '@lineas/nucleo/mecanica';
import { detalleVanos } from '@lineas/nucleo/vanos';
import { evaluarUmbrales } from '@lineas/nucleo/umbrales';
import { cantidadesGeometricas } from '@lineas/nucleo/cantidades';
import { estadisticasVanos } from '@lineas/nucleo/estadisticas';
import { vanos, soloEstructuras, nombreVisible } from '../vistas/planta';
import { conductorParaNucleo, paramsParaNucleo, calcularTramos } from '../vistas/tramos';
import { cargasParaPantalla } from '../vistas/cargasDatos';
import { longitudinalParaPantalla } from '../vistas/longitudinalDatos';
import { descargar, selloFecha } from '../exportar/descargar';
import { ejesDeLinea } from '../vistas/ejesLinea';
import { nf } from '../vistas/formato';

export function Exportar({ linea, apoyos, conductor, hipotesis, investigaciones = [] }:
  { linea: TLinea; apoyos: Apoyo[]; conductor?: Conductor; hipotesis?: Hipotesis;
    investigaciones?: Investigacion[] }) {

  const lev = useMemo(() => derivarLevantamiento(apoyos), [apoyos]);

  /**
   * Todo el cálculo del que salen los tres entregables nuevos, resuelto UNA
   * vez. Es el mismo que pinta Mecánico: si se recalculara aquí con otra
   * hipótesis, el informe firmado y la pantalla dirían cosas distintas.
   */
  const calc = useMemo(() => {
    if (!conductor || !hipotesis) return null;
    const E = soloEstructuras(apoyos);
    if (E.length < 2) return null;
    const L = vanos(apoyos);
    const c = conductorParaNucleo(conductor);
    const p = paramsParaNucleo(hipotesis);
    const cortes = tramosDeTension(
      E.map((a) => ({ funcionEstructural: a.funcionEstructural, nombre: nombreVisible(a) })), L);

    // Vanos numerados de forma CORRIDA sobre toda la línea: `detalleVanos`
    // numera dentro de cada tramo, y tres "vano 1" en un archivo firmado son
    // una llamada del cliente preguntando cuál es cuál.
    let corrido = 0;
    const filasVano: Record<string, unknown>[] = [];
    const conEstados = cortes.map((t: { vanos: number[] }, i: number) => {
      const e = estadosDelTramo(t, c, p);
      for (const f of detalleVanos(t, c, e) as Record<string, unknown>[]) {
        filasVano.push({ ...f, n: ++corrido, tramo: i + 1 });
      }
      return { ...t, estados: e };
    });

    const vanosConLongitud = filasVano.map((f) => ({
      vano_m: f.a_m as number,
      longitudConductor_m: f.longitudConductor_m as number,
    }));

    // Los tramos se calculan UNA vez y se reusan para las cargas: si el exporte
    // pidiera los suyos por separado, el informe firmado podría discrepar de la
    // pestaña Cargas por un cambio en una sola de las dos rutas.
    const tramos = calcularTramos(apoyos, conductor, hipotesis);

    return {
      tramos,
      cargas: cargasParaPantalla(apoyos, tramos, conductor, hipotesis, linea.circuitos).filas,
      // El otro eje. Reusa `conEstados`, que ya trae los estados RICOS que el
      // núcleo longitudinal exige (la forma aplanada la rechaza a propósito).
      longitudinal: longitudinalParaPantalla(apoyos, conEstados, conductor).filas,
      vanos: filasVano,
      indicadores: evaluarUmbrales({
        tramos: conEstados, conductor: c, hipotesis,
        estadisticas: estadisticasVanos(L) ?? undefined, apoyos,
      }),
      cantidades: cantidadesGeometricas({
        vanos_m: vanosConLongitud,
        apoyos: apoyos.map((a) => ({
          funcionEstructural: a.funcionEstructural,
          tipoPunto: a.tipoPunto ?? 'Estructura',
        })),
        conductor: { codigo: conductor.codigo },
        circuitos: linea.circuitos ?? 1,
      }),
    };
  }, [linea, apoyos, conductor, hipotesis]);
  const [info, setInfo] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);

  const completitud = useMemo(() => {
    const n = lev.puntos.length;
    const conCota = lev.puntos.filter((p) => p.cota_m != null).length;
    const conHora = lev.puntos.filter((p) => p.local != null).length;
    const sinCanonico = apoyos.filter((a) => !a.nombreNormalizado).length;

    // LA COBERTURA DE VEREDICTO TAMBIÉN SE DECLARA AQUÍ. Era el bloqueante nº5
    // de la crítica de oficio, y el sitio importa: ésta es la pantalla por la
    // que el número SALE del sistema y entra en un correo. Una tabla de
    // completitud que cuenta cotas y horas y calla que ningún apoyo tiene
    // veredicto declara lo accesorio y omite lo principal.
    // Se deriva del motor (`utilizacion_pct !== null`), nunca de los campos.
    // Sin conductor o sin hipótesis no hay motor que pueda dictaminar nada, y
    // entonces la cifra no se estima: sencillamente no se declara.
    let dictaminados = 0, estructuras = 0;
    if (conductor && hipotesis) {
      const ejes = ejesDeLinea(apoyos, conductor, hipotesis, linea.circuitos);
      const trans = new Set(ejes.transversal.filas.filter((f) => f.utilizacion_pct !== null).map((f) => f.apoyo));
      const long = new Set((ejes.longitudinal?.filas ?? []).filter((f) => f.utilizacion_pct !== null).map((f) => f.apoyo));
      for (const a of trans) if (long.has(a)) dictaminados++;
      estructuras = Math.max(ejes.transversal.total, ejes.longitudinal?.total ?? 0);
    }

    return { n, conCota, conHora, sinCanonico, dictaminados, estructuras };
  }, [lev, apoyos, conductor, hipotesis, linea.circuitos]);

  /**
   * LA CAPACIDAD EN CORRIENTE — se calcula UNA vez y va a los DOS papeles.
   *
   * ⚠️ Si cada generador la recalculara, dos documentos de la misma línea
   * podrían publicar amperajes distintos, que es justo lo que el dueño único de
   * `nucleo/termica.js` vino a cerrar (`99 §ADR-093`).
   */
  const ampacidadReferencia = useMemo(
    () => ampacidadDeLinea({ conductor, hipotesis }), [conductor, hipotesis]);

  const bajar = (contenido: string, extension: string, mime: string, generar: (meta: { generadoEn: string; hipotesisNombre?: string }) => string) => {
    try {
      setFallo(null);
      // ⚠️ `versionNucleo` NO es adorno. `exportar/` no la adivina a propósito —
      // la declara quien manda a generar— y sin ella el informe FIRMABLE imprime
      // en su propia portada «versión NO declarada — sin ella este informe no es
      // reproducible». Es decir: el papel que se firma se autodenunciaba, y lo
      // hacía por una línea que nadie escribió (`99 §ADR-092`).
      const meta = {
        generadoEn: new Date().toISOString(),
        hipotesisNombre: hipotesis?.nombre,
        versionNucleo: nucleoPkg.version,
      };
      const nombre = `${linea.codigo}_${contenido}_${selloFecha()}.${extension}`;
      descargar(nombre, mime, generar(meta));
      setInfo(`Se descargó ${nombre} — ${lev.puntos.length} puntos (${lev.nEstructuras} estructuras + ${lev.nEmpalmes} empalmes), ${nf(lev.longitud_m)} m de línea.`);
    } catch (e) {
      setInfo(null);
      setFallo('No se pudo generar el archivo. El detalle técnico quedó en la consola del navegador.');
      console.error('exportar:', e);
    }
  };

  const sinDatos = lev.puntos.length === 0;
  const sinCalculo = calc === null;

  return (
    <section className="panel">
      <h2>Exportar el levantamiento</h2>
      <p className="fine">
        Cada archivo se genera desde los <b>datos</b> de la línea — nunca desde la pantalla — con la
        misma geometría que ven las demás pestañas: {nf(lev.nEstructuras)} estructuras,{' '}
        {nf(lev.nEmpalmes)} empalmes (que no son apoyos), {nf(sinDatos ? 0 : lev.nEstructuras - 1)} vanos
        reales y {nf(lev.tramos.length)} tramos de tensión.
      </p>
      <p className="fine">
        <b>Procedencia:</b> el GPX, el KML y el CSV de Excel llevan una cabecera con la versión del
        exportador, la hipótesis, el sistema de referencia y la precisión del GPS. El CSV de datos
        crudos <b>no la lleva</b>, a propósito: una cabecera rompe el formato RFC 4180 que esperan
        QGIS, pandas y R. Ese archivo declara su procedencia <b>columna por columna</b>
        (<code>Precision_m</code>, <code>Metodo</code>, <code>Sistema_referencia</code>), y el nombre
        del archivo lleva la fecha y hora de generación.
      </p>
      <p className="fine">
        Completitud del dato: {nf(completitud.conCota)} de {nf(completitud.n)} puntos con cota GPS ·{' '}
        {nf(completitud.conHora)} con hora de toma
        {completitud.sinCanonico > 0 && <> · {nf(completitud.sinCanonico)} sin nombre canónico</>}.
        {completitud.estructuras > 0 && (
          <>
            {' '}
            <b className={completitud.dictaminados === 0 ? 'alerta-en-linea' : undefined}>
              {nf(completitud.dictaminados)} de {nf(completitud.estructuras)} apoyos con veredicto
              estructural en los dos ejes
            </b>
            {completitud.dictaminados === 0
              ? ' — lo que salga de aquí NO lleva dictamen de apoyo, y así debe leerse en destino.'
              : '.'}
          </>
        )}
      </p>

      <div className="exportar-botones">
        <button type="button" disabled={sinDatos}
          onClick={() => bajar('levantamiento', 'gpx', 'application/gpx+xml', (m) => generarGpx(linea, lev, m))}>
          ⬇ GPX 1.1 (waypoints + track) — Garmin, QGIS
        </button>
        <button type="button" disabled={sinDatos}
          onClick={() => bajar('levantamiento', 'kml', 'application/vnd.google-earth.kml+xml', (m) => generarKml(linea, lev, m))}>
          ⬇ KML con atributos — Google Earth, QGIS
        </button>
        <button type="button" disabled={sinDatos}
          onClick={() => bajar('levantamiento_excel', 'csv', 'text/csv', (m) => generarCsv(lev, { dialecto: 'excel', linea, ...m }))}>
          ⬇ CSV para Excel en español (sep ; y coma decimal)
        </button>
        <button type="button" disabled={sinDatos}
          onClick={() => bajar('levantamiento_datos', 'csv', 'text/csv', () => generarCsv(lev, { dialecto: 'datos' }))}>
          ⬇ CSV de datos crudos (RFC 4180) — QGIS, pandas, R
        </button>
      </div>

      <h2 className="exportar-titulo">Cálculo y entregables</h2>
      <p className="fine">
        Estos salen del <b>mismo motor</b> que pinta las pestañas: un número del informe y el de la
        pantalla no pueden discrepar, porque los produce la misma función.
      </p>
      <div className="exportar-botones">
        <button type="button" disabled={sinCalculo}
          onClick={() => bajar('verificacion_mecanica', 'csv', 'text/csv',
            (m) => csvVerificacionMecanica(
              { ...calc!, linea, conductor, hipotesis, levantamiento: lev },
              { dialecto: 'excel', ...m }))}>
          ⬇ Verificación mecánica (CSV) — tramos, vanos, los dos ejes de carga y umbrales
        </button>
        <button type="button" disabled={sinCalculo}
          onClick={() => bajar('cantidades', 'csv', 'text/csv',
            (m) => csvCantidades(
              { linea, cantidades: calc!.cantidades, levantamiento: lev },
              { dialecto: 'excel', ...m }))}>
          ⬇ Memoria de cantidades (CSV) — con lo que NO se puede cuantificar
        </button>
        <button type="button" disabled={sinCalculo}
          onClick={() => bajar('informe', 'html', 'text/html',
            (m) => informeHtml({
              linea, conductor, hipotesis, lev,
              tramos: calc!.tramos, vanos: calc!.vanos, indicadores: calc!.indicadores,
              cargas: calc!.cargas, longitudinal: calc!.longitudinal,
              cantidades: calc!.cantidades, investigaciones, meta: m,
              ampacidadReferencia,
              // ⚠️ `cargabilidad` va explícitamente sin definir: la MEDIDA de
              // operación vive en su pestaña y no viaja a este papel todavía.
              // El informe imprime la CAPACIDAD y dice «sin medida cargada»
              // en vez de callar el hueco.
              cargabilidad: undefined,
            }))}>
          ⬇ Informe completo (HTML imprimible) — se abre sin internet
        </button>
        {/* El gerencial NO es el técnico resumido: contesta otras preguntas
            —¿puedo firmar hoy?, ¿qué mando el lunes?, ¿qué queda abierto?— y
            comparte con él el DUEÑO de la lista de límites, para que los dos
            papeles de la misma línea no puedan decir cosas distintas. */}
        <button type="button" disabled={sinCalculo}
          onClick={() => bajar('informe-gerencial', 'html', 'text/html',
            (m) => gerencialHtml({
              linea, conductor, hipotesis, lev,
              indicadores: calc!.indicadores, cargas: calc!.cargas,
              cantidades: calc!.cantidades, investigaciones,
              meta: m, ampacidadReferencia,
            }))}>
          ⬇ Informe GERENCIAL — para quien decide, no para quien calcula
        </button>
      </div>

      <div aria-live="polite">
        {info && <p className="ok">{info}</p>}
        {fallo && <p className="alerta">{fallo}</p>}
      </div>

      <p className="advertencia">
        <b>Qué cambia frente al módulo original:</b> el CSV conserva la distancia GPS entre puntos
        consecutivos (<code>Dist_punto_anterior_m</code>), pero el <code>Vano_anterior_m</code> es el
        vano <b>real entre estructuras</b> — un empalme no es un apoyo y no corta vanos. Además el
        Excel en español recibe coma decimal (el original entregaba punto y Excel lo leía como
        texto). El informe fotográfico y el proyecto (.json) llegan con la captura de campo (F4),
        cuando existan fotos y notas de verdad en el sistema.
      </p>
    </section>
  );
}
