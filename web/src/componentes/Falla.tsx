// ============================================================================
// componentes/Falla.tsx — el expediente del evento que abrió la línea
// ----------------------------------------------------------------------------
// La pieza de más valor del módulo original, y la que exige más honestidad:
// separa con una línea visible lo que se VE (observaciones sobre la evidencia)
// de lo que se CONCLUYE (hipótesis con su grado de certeza), y termina con lo
// que TODAVÍA no se puede afirmar y con qué se cerraría.
//
// Un informe que omite esa última parte parece más fuerte y es más frágil: la
// primera pregunta del cliente apunta justo ahí.
//
// Todo sale del documento `Investigacion` leído de la base. Aquí no hay ni un
// dato escrito a mano.
// ============================================================================
import type { Apoyo, Evidencia, Investigacion } from '@lineas/contratos';
import { Galeria } from './Galeria';
import { almacen } from '../datos/enlace';
import { derivarLevantamiento } from '@lineas/exportar/levantamiento';
import { useMemo } from 'react';
import { nf } from '../vistas/formato';

const html = (s: string) => <span dangerouslySetInnerHTML={{ __html: s }} />;

const CLASE_SEVERIDAD: Record<string, string> = {
  critica: 'atencion',
  advertencia: 'aviso',
  contexto: 'info',
};

const ROTULO_VEROSIMILITUD: Record<string, string> = {
  alta: 'Verosimilitud alta',
  media: 'Verosimilitud media',
  baja: 'Verosimilitud baja',
};

export function Falla({ investigaciones, apoyos, evidencias = [] }:
  { investigaciones: Investigacion[]; apoyos: Apoyo[]; evidencias?: Evidencia[] }) {

  const lev = useMemo(() => derivarLevantamiento(apoyos), [apoyos]);

  if (!investigaciones.length) {
    return (
      <section className="panel">
        <h2>Eventos de falla</h2>
        <p className="ok">
          Esta línea no tiene ningún expediente de falla registrado. No es un hueco de la
          aplicación: es el estado de la línea.
        </p>
      </section>
    );
  }

  return (
    <>
      {investigaciones.map((ev) => {
        const i = apoyos.findIndex((a) => a.id === ev.apoyoId);
        const punto = i >= 0 ? lev.puntos.find((p) => p.n === i + 1) : undefined;

        return (
          <div key={ev.id}>
            <section className="falla-banda">
              <div className="falla-rotulo">Evento de falla</div>
              <h2 className="falla-titulo">
                {punto?.nombre ?? 'Estructura no identificada'}
                {ev.placa ? ` — placa ${ev.placa}` : ''}
              </h2>
              <p className="falla-sub">
                {ev.fechaTexto ?? new Date(ev.ocurrioEn).toLocaleDateString('es-CO')} ·{' '}
                {ev.componenteAfectado} · apertura de la línea
              </p>
              {punto && (
                <p className="falla-geo">
                  {punto.latGMS} · {punto.lonGMS}
                  {punto.progresiva_m != null && <> · progresiva {nf(punto.progresiva_m, 2)} m</>}
                  {punto.deflexion_grados != null && <> · deflexión {punto.deflexion_grados.toFixed(2)}°</>}
                  {punto.funcionEstructural && <> · {punto.funcionEstructural}</>}
                </p>
              )}
            </section>

            {/* El puente al segmento RCA. El expediente registra el HECHO; el
                análisis razona sobre él, y vive fuera porque puede abarcar
                varias líneas. Abrirlo desde aquí es lo que hace que el segmento
                deje de estar vacío. */}
            <section className="panel rca-puente">
              <div>
                <b>Análisis de causa raíz</b>
                <p className="fine">
                  Este expediente registra lo que PASÓ. Un análisis de causa raíz razona sobre
                  ello con método —once familias de causas, porqués con nivel, barreras— y vive
                  fuera de la línea, porque una misma causa puede repetirse en varias.
                </p>
              </div>
              <button
                type="button"
                className="boton chico"
                onClick={() => void almacen.crearRcaDesdeEvento({
                  titulo: `${ev.componenteAfectado} — ${punto?.nombre ?? 'estructura no identificada'}`,
                  lineaId: ev.lineaId,
                  apoyoId: ev.apoyoId,
                  investigacionId: ev.id,
                })}
              >
                Abrir análisis
              </button>
            </section>

            <Galeria evidencias={evidencias.filter((x) => x.investigacionId === ev.id)} />

            {ev.cronologia.length > 0 && (
              <section className="panel">
                <h2>Cronología del evento</h2>
                <div className="tabla-caja">
                  <table className="tabla">
                    <caption>Lo que se hizo y cuándo, según el registro de campo.</caption>
                    <thead><tr><th>Cuándo</th><th>Qué</th></tr></thead>
                    <tbody>
                      {ev.cronologia.map((c, k) => (
                        <tr key={k}>
                          <td className="falla-cuando">{c.cuando}</td>
                          <td>{html(c.que)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {ev.observaciones.length > 0 && (
              <section className="panel">
                <h2>Lectura de la evidencia — lo que se VE</h2>
                <p className="fine">
                  Observaciones sobre la pieza y el registro fotográfico. <b>No son conclusiones:</b>{' '}
                  las conclusiones van en el bloque siguiente, con su grado de certeza declarado.
                </p>
                <ul className="calidad-lista">
                  {ev.observaciones.map((o, k) => (
                    <li key={k} className={`calidad-item ${CLASE_SEVERIDAD[o.severidad] ?? 'info'}`}>
                      <b>{o.titulo}.</b> {html(o.detalle)}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {ev.hipotesis.length > 0 && (
              <section className="panel">
                <h2>Hipótesis causales — lo que se CONCLUYE</h2>
                <p className="fine">
                  Ordenadas por verosimilitud. Cada una declara en qué se apoya, para que se pueda
                  discutir el razonamiento y no solo el veredicto.
                </p>
                <div className="hip-lista">
                  {ev.hipotesis.map((h, k) => (
                    <article key={k} className={`hip hip-${h.verosimilitud}`}>
                      <header className="hip-cab">
                        <span className="hip-orden">{k + 1}</span>
                        <h3>{h.enunciado}</h3>
                        <span className={`sello hip-sello-${h.verosimilitud}`}>
                          {ROTULO_VEROSIMILITUD[h.verosimilitud] ?? h.verosimilitud}
                        </span>
                      </header>
                      <p className="fund-texto">{html(h.sustento)}</p>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {ev.verificacionesPendientes.length > 0 && (
              <section className="panel">
                <h2>Qué falta para cerrar el análisis</h2>
                <p className="fine">
                  <b>{nf(ev.verificacionesPendientes.filter((v) => v.estado === 'pendiente').length)} de{' '}
                  {nf(ev.verificacionesPendientes.length)}</b> sin resolver. Esta lista es lo que
                  separa un informe defendible de uno que solo suena convincente.
                </p>
                <div className="tabla-caja">
                  <table className="tabla">
                    <caption>Verificaciones que cerrarían o descartarían las hipótesis.</caption>
                    <thead><tr><th>Qué se necesita</th><th>Por qué</th><th>Estado</th></tr></thead>
                    <tbody>
                      {ev.verificacionesPendientes.map((v, k) => (
                        <tr key={k}>
                          <td><b>{v.que}</b></td>
                          <td className="falla-porque">{v.porQue}</td>
                          <td><span className={`sello ${v.estado === 'recibido' ? 'verde' : v.estado === 'no_disponible' ? 'gris' : 'ambar'}`}>
                            {v.estado === 'no_disponible' ? 'no disponible' : v.estado}
                          </span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <p className="advertencia">
              <b>Este expediente no es un dictamen firmado.</b> Es el razonamiento documentado con la
              evidencia disponible hoy; las hipótesis se cierran con las verificaciones de arriba.
              Quien firma es el ingeniero, no el sistema.
            </p>
          </div>
        );
      })}
    </>
  );
}
