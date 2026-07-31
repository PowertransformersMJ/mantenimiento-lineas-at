// ============================================================================
// componentes/Cantidades.tsx — la memoria de cantidades (BOM) geométrica
// ----------------------------------------------------------------------------
// REGLA DE ORO de esta pestaña: **un BOM inventado es peor que no tener BOM**,
// porque alguien compra con él. Por eso la tabla de avisos no es un apéndice:
// es tan importante como las cantidades, y dice qué NO se puede cuantificar
// todavía y por qué.
//
// Lo que sí sale hoy es la geometría —longitud real de conductor por catenaria,
// no por vanos rectos— y el conteo de apoyos por función. Todo lo que dependa
// de la captura en campo (crucetas, retenidas, herrajes, aisladores) se declara
// pendiente, no se estima.
// ============================================================================
import { useMemo } from 'react';
import type { Apoyo, Conductor, Hipotesis, Linea as TLinea } from '@lineas/contratos';
import { cantidadesGeometricas } from '@lineas/nucleo/cantidades';
import { tramosDeTension, estadosDelTramo, longitudCatenaria } from '@lineas/nucleo/mecanica';
import { conductorParaNucleo, paramsParaNucleo } from '../vistas/tramos';
import { vanos, soloEstructuras, nombreVisible } from '../vistas/planta';
import { nf } from '../vistas/formato';
import { Sello } from './Sello';

interface Fila { concepto: string; cantidad: number; unidad: string; base?: string; procedencia?: string }
interface Aviso { concepto: string; motivo: string }

export function Cantidades({ linea, apoyos, conductor, hipotesis }:
  { linea: TLinea; apoyos: Apoyo[]; conductor: Conductor; hipotesis: Hipotesis }) {

  const r = useMemo(() => {
    const E = soloEstructuras(apoyos);
    if (E.length < 2) return null;
    const L = vanos(apoyos);
    const c = conductorParaNucleo(conductor);
    const p = paramsParaNucleo(hipotesis);

    // La longitud REAL del conductor sale de la catenaria de cada vano con el
    // tiro de su propio tramo — no de la suma de vanos rectos, que se queda
    // corta justo en los vanos largos, que son los que más cable llevan.
    const cortes = tramosDeTension(
      E.map((a) => ({ funcionEstructural: a.funcionEstructural, nombre: nombreVisible(a) })), L);
    const vanosConLongitud: { vano_m: number; longitudConductor_m: number }[] = [];
    for (const t of cortes) {
      const e = estadosDelTramo(t, c, p);
      for (const a of t.vanos as number[]) {
        vanosConLongitud.push({
          vano_m: a,
          longitudConductor_m: longitudCatenaria(conductor.masaLineal_kg_m, a, e.eds.H),
        });
      }
    }

    return cantidadesGeometricas({
      vanos_m: vanosConLongitud,
      apoyos: apoyos.map((a) => ({
        funcionEstructural: a.funcionEstructural,
        tipoPunto: a.tipoPunto ?? 'Estructura',
      })),
      // Solo el código, para rotular. El número de conductores por circuito NO
      // se supone: sin ese dato el módulo manda el conductor a `avisos` en vez
      // de multiplicar por un 3 inventado.
      conductor: { codigo: conductor.codigo },
      circuitos: linea.circuitos ?? 1,
    }) as { continuas: Fila[]; discretas: Fila[]; avisos: Aviso[] };
  }, [linea, apoyos, conductor, hipotesis]);

  if (!r) {
    return (
      <section className="panel">
        <h2>Memoria de cantidades</h2>
        <p className="fine">Se necesitan al menos dos estructuras para calcular cantidades.</p>
      </section>
    );
  }

  const tabla = (titulo: string, filas: Fila[], decimales: number) => (
    <div className="tabla-caja">
      <table className="tabla">
        <caption>{titulo}</caption>
        <thead><tr><th>Concepto</th><th>Cantidad</th><th>Unidad</th><th>De dónde sale</th></tr></thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.concepto}>
              <td><b>{f.concepto}</b></td>
              <td className="num destaca">{nf(f.cantidad, decimales)}</td>
              <td>{f.unidad}</td>
              <td className="umbral-criterio">{f.base ?? f.procedencia ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <section className="panel">
        <h2>Cantidades continuas</h2>
        <p className="fine">
          La longitud de conductor se calcula por <b>catenaria vano a vano</b>, no sumando vanos
          rectos: la diferencia aparece justo en los vanos largos, que son los que más cable llevan.
        </p>
        <Sello hipotesis={hipotesis} conductor={conductor} />
        {r.continuas.length
          ? tabla('Materiales que se miden en longitud.', r.continuas, 1)
          : <p className="alerta">No se publica ninguna cantidad continua: falta un dato que no se
              puede suponer (ver los avisos de abajo).</p>}
      </section>

      <section className="panel">
        <h2>Conteos</h2>
        {tabla('Elementos que se cuentan. Los empalmes van aparte: no son apoyos.', r.discretas, 0)}
      </section>

      <section className="panel">
        <h2>Lo que todavía NO se puede cuantificar</h2>
        <p className="fine">
          Un BOM inventado es peor que no tener BOM, porque alguien compra con él. Esto es lo que
          falta y por qué — no una estimación.
        </p>
        {r.avisos.length === 0
          ? <p className="ok">Todo lo previsto se pudo cuantificar con los datos disponibles.</p>
          : (
            <ul className="calidad-lista">
              {r.avisos.map((a) => (
                <li key={a.concepto} className="calidad-item aviso">
                  <b>{a.concepto}.</b> {a.motivo}
                </li>
              ))}
            </ul>
          )}
      </section>
    </>
  );
}
