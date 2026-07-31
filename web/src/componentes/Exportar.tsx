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
import { useMemo, useState } from 'react';
import type { Apoyo, Hipotesis, Linea as TLinea } from '@lineas/contratos';
import { derivarLevantamiento } from '@lineas/exportar/levantamiento';
import { generarGpx } from '@lineas/exportar/gpx';
import { generarKml } from '@lineas/exportar/kml';
import { generarCsv } from '@lineas/exportar/csv';
import { descargar, selloFecha } from '../exportar/descargar';
import { nf } from '../vistas/formato';

export function Exportar({ linea, apoyos, hipotesis }:
  { linea: TLinea; apoyos: Apoyo[]; hipotesis?: Hipotesis }) {

  const lev = useMemo(() => derivarLevantamiento(apoyos), [apoyos]);
  const [info, setInfo] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);

  const completitud = useMemo(() => {
    const n = lev.puntos.length;
    const conCota = lev.puntos.filter((p) => p.cota_m != null).length;
    const conHora = lev.puntos.filter((p) => p.local != null).length;
    const sinCanonico = apoyos.filter((a) => !a.nombreNormalizado).length;
    return { n, conCota, conHora, sinCanonico };
  }, [lev, apoyos]);

  const bajar = (contenido: string, extension: string, mime: string, generar: (meta: { generadoEn: string; hipotesisNombre?: string }) => string) => {
    try {
      setFallo(null);
      const meta = { generadoEn: new Date().toISOString(), hipotesisNombre: hipotesis?.nombre };
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
