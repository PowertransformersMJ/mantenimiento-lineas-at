// ============================================================================
// componentes/Exportar.tsx — la pestaña Exportar
// ----------------------------------------------------------------------------
// Réplica de la pestaña del módulo original (GPX 1.1 · KML · CSV), con la
// diferencia de fondo del ADR-005: los archivos se generan DESDE LOS DATOS,
// jamás desde la pantalla. Aquí no hay ni una fórmula ni un formato: React
// solo pinta botones y le pide el texto a web/src/exportar/.
//
// El informe fotográfico y guardar/cargar proyecto del original llegan con la
// captura de campo (F4): dependen de fotos y notas que este sistema aún no
// tiene, y aquí no se finge nada.
// ============================================================================
import { useMemo, useState } from 'react';
import type { Apoyo, Linea as TLinea } from '@lineas/contratos';
import { derivarLevantamiento } from '../exportar/levantamiento';
import { generarGpx } from '../exportar/gpx';
import { generarKml } from '../exportar/kml';
import { generarCsv } from '../exportar/csv';
import { descargar, selloFecha } from '../exportar/descargar';
import { nf } from '../vistas/formato';

export function Exportar({ linea, apoyos }: { linea: TLinea; apoyos: Apoyo[] }) {
  const lev = useMemo(() => derivarLevantamiento(apoyos), [apoyos]);
  const [info, setInfo] = useState<string | null>(null);

  const bajar = (extension: string, mime: string, texto: string) => {
    const nombre = `${linea.codigo}_${selloFecha()}.${extension}`;
    descargar(nombre, mime, texto);
    setInfo(`Se descargó ${nombre} — ${lev.puntos.length} puntos (${lev.nEstructuras} estructuras + ${lev.nEmpalmes} empalmes), ${nf(lev.longitud_m)} m de línea.`);
  };

  return (
    <section className="panel">
      <h2>Exportar el levantamiento</h2>
      <p className="fine">
        Cada archivo se genera desde los <b>datos</b> de la línea — nunca desde la pantalla — con la
        misma geometría que ven las demás pestañas: {nf(lev.nEstructuras)} estructuras,{' '}
        {nf(lev.nEmpalmes)} empalmes (que no son apoyos), {nf(lev.puntos.length ? lev.nEstructuras - 1 : 0)} vanos
        reales y {nf(lev.tramos.length)} tramos de tensión.
      </p>

      <div className="exportar-botones">
        <button type="button" onClick={() => bajar('gpx', 'application/gpx+xml', generarGpx(linea, lev))}>
          ⬇ GPX 1.1 (waypoints + track)
        </button>
        <button type="button" onClick={() => bajar('kml', 'application/vnd.google-earth.kml+xml', generarKml(linea, lev))}>
          ⬇ KML (Google Earth / QGIS)
        </button>
        <button type="button" onClick={() => bajar('csv', 'text/csv', generarCsv(lev))}>
          ⬇ CSV (coordenadas, vanos, azimuts)
        </button>
      </div>

      {info && <p className="ok">{info}</p>}

      <p className="advertencia">
        <b>Qué cambia frente al módulo original:</b> el CSV conserva la distancia GPS entre puntos
        consecutivos (<code>Dist_punto_anterior_m</code>), pero el <code>Vano_anterior_m</code> es el
        vano <b>real entre estructuras</b> — un empalme no es un apoyo y no corta vanos. El informe
        fotográfico y el proyecto (.json) del módulo original llegan con la captura de campo (F4),
        cuando existan fotos y notas de verdad en el sistema.
      </p>
    </section>
  );
}
