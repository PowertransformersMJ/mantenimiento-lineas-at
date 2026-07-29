// ============================================================================
// main.ts — punto de entrada
// ----------------------------------------------------------------------------
// REGLA (orden del Ingeniero, 2026-07-29): en esta página NO hay datos
// inventados. Nada se muestra si no viene de un levantamiento real.
//
// Y como el sitio es PÚBLICO, los datos reales no viajan dentro de lo que se
// publica: llegan por lectura autenticada. De ahí que el estado inicial sea
// vacío — es la única forma honesta de cumplir las dos cosas a la vez.
// ============================================================================
import './estilo.css';
import { repositorio, type EstadoDatos } from './datos/repositorio';
import { dibujarPlanta, proyectar, vanos } from './vistas/planta';
import { calcularTramos, dibujarTramos } from './vistas/tramos';
import { vanoIdealRegulacion } from '@lineas/nucleo/geodesia';
import { ampacidad, temperaturaLimite } from '@lineas/nucleo/termica';
import { VERSION_CONTRATO } from '@lineas/contratos';

const nf = (v: number, d = 0) =>
  v.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });

const kpi = (valor: string, etiqueta: string, sub = '') =>
  `<div class="kpi"><div class="kpi-v">${valor}</div><div class="kpi-l">${etiqueta}</div>
   ${sub ? `<div class="kpi-s">${sub}</div>` : ''}</div>`;

const cabecera = () => `
  <header class="cab">
    <div>
      <h1>Mantenimiento Líneas AT</h1>
      <p class="sub">Gestión del mantenimiento de líneas de alta tensión · Caribe colombiano</p>
    </div>
    <span class="fase">Fase 0 · fundación</span>
  </header>`;

const pie = () => `
  <footer class="pie">
    El sistema no certifica nada. Certifica el ingeniero que firma.
    El trabajo del sistema es hacer barato comprobar que ese ingeniero tiene razón.
    <span class="ver">contrato v${VERSION_CONTRATO}</span>
  </footer>`;

/** Estados que NO son el camino feliz. Se pintan desde el día 1 (ADR-004). */
function pintarEstado(titulo: string, cuerpo: string, accion = ''): string {
  return `<section class="panel vacio">
    <div class="vacio-t">${titulo}</div>
    <p class="vacio-c">${cuerpo}</p>
    ${accion}
  </section>`;
}

function pintarLinea(d: Extract<EstadoDatos, { fase: 'listo' }>): string {
  const { linea, apoyos, conductor, hipotesis } = d;
  const L = vanos(apoyos);
  const longitud = L.reduce((s, v) => s + v, 0);
  const filas = calcularTramos(apoyos, conductor, hipotesis);
  const anclas = proyectar(apoyos).filter((p) => p.esAncla).length;
  const amp = ampacidad(
    { material: conductor.material, seccion: conductor.seccion_mm2, diametro: conductor.diametro_m },
    temperaturaLimite(conductor.material), 32,
    { v: 0.61, eps: 0.5, abso: 0.5, qs: 1000, he: 10 },
  );

  return `
    <section class="panel">
      <h2>${linea.codigo} · ${linea.nombre} — ${nf(linea.tensionNominal_kV)} kV</h2>
      <div class="kpis">
        ${kpi(nf(apoyos.length), 'apoyos')}
        ${kpi(nf(longitud / 1000, 3) + ' km', 'longitud')}
        ${kpi(nf(L.length), 'vanos', 'medio ' + nf(longitud / L.length, 1) + ' m')}
        ${kpi(nf(vanoIdealRegulacion(L) ?? 0, 1) + ' m', 'VIR de la línea', 'pero se calcula por tramo')}
        ${kpi(nf(filas.length), 'tramos de tensión', anclas + ' anclajes')}
        ${kpi(nf(amp) + ' A', 'ampacidad IEEE 738', temperaturaLimite(conductor.material) + ' °C · 32 °C amb.')}
      </div>
    </section>

    <section class="panel">
      <h2>Vista en planta</h2>
      <div class="mapa">${dibujarPlanta(apoyos)}</div>
      <p class="leyenda">
        <span class="li ancla"></span> anclaje
        <span class="li susp"></span> suspensión
        <span class="li term"></span> terminal
        <span class="fine">— pase el cursor sobre un apoyo para ver su función y deflexión</span>
      </p>
    </section>

    <section class="panel">
      <h2>Cálculo mecánico por tramo</h2>
      ${dibujarTramos(filas, conductor, hipotesis)}
    </section>`;
}

function cuerpoSegunEstado(d: EstadoDatos): string {
  switch (d.fase) {
    case 'sin_sesion':
      return pintarEstado(
        'Inicie sesión para ver sus líneas',
        `Esta página no contiene ningún dato: las líneas reales se leen de la base después de
         autenticarse. Es deliberado — el sitio es público, y las coordenadas de la infraestructura
         de un cliente no pueden viajar dentro de lo que se publica en internet.`,
        `<p class="fine">El acceso todavía no está habilitado: la base de datos está en montaje.</p>`,
      );
    case 'cargando':
      return pintarEstado('Cargando…', 'Leyendo la línea desde la base.');
    case 'vacio':
      return pintarEstado(
        'No hay líneas cargadas',
        'Su usuario no tiene ninguna línea asignada todavía.',
      );
    case 'error':
      return pintarEstado('No se pudo cargar', d.mensaje);
    case 'listo':
      return pintarLinea(d);
  }
}

async function montar(): Promise<void> {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = cabecera() + cuerpoSegunEstado({ fase: 'cargando' }) + pie();

  let estado: EstadoDatos;
  try {
    const s = await repositorio.sesion();
    if (s.fase !== 'autenticado') {
      estado = { fase: 'sin_sesion' };
    } else {
      const lineas = await repositorio.listarLineas();
      estado = lineas.length
        ? await repositorio.cargarLinea(lineas[0].id)
        : { fase: 'vacio' };
    }
  } catch (e) {
    estado = { fase: 'error', mensaje: e instanceof Error ? e.message : 'error desconocido' };
  }

  app.innerHTML = cabecera() + cuerpoSegunEstado(estado) + pie();
}

void montar();
