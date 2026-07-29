// ============================================================================
// main.ts — punto de entrada del caparazón público
// ----------------------------------------------------------------------------
// Este paquete se publica en internet. NO contiene datos de cliente: solo el
// caparazón y una línea de demostración inventada. Los datos reales llegan
// después, por sincronización autenticada.
// ============================================================================
import './estilo.css';
import { LINEA_DEMO, CONDUCTOR_DEMO, HIPOTESIS_DEMO } from './datos/demo';
import { dibujarPlanta, proyectar, vanos } from './vistas/planta';
import { calcularTramos, dibujarTramos } from './vistas/tramos';
import { vanoIdealRegulacion } from '@lineas/nucleo/geodesia';
import { ampacidad, temperaturaLimite } from '@lineas/nucleo/termica';

const nf = (v: number, d = 0) =>
  v.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });

function kpi(valor: string, etiqueta: string, sub = ''): string {
  return `<div class="kpi"><div class="kpi-v">${valor}</div><div class="kpi-l">${etiqueta}</div>
    ${sub ? `<div class="kpi-s">${sub}</div>` : ''}</div>`;
}

function montar(): void {
  const app = document.getElementById('app');
  if (!app) return;

  const apoyos = LINEA_DEMO;
  const c = CONDUCTOR_DEMO;
  const h = HIPOTESIS_DEMO;

  const L = vanos(apoyos);
  const longitud = L.reduce((s, v) => s + v, 0);
  const filas = calcularTramos(apoyos, c, h);
  const pts = proyectar(apoyos);
  const anclas = pts.filter((p) => p.esAncla).length;
  const amp = ampacidad(
    { material: c.material, seccion: c.seccion, diametro: c.diametro },
    temperaturaLimite(c.material), 32, { v: 0.61, eps: 0.5, abso: 0.5, qs: 1000, he: 10 },
  );

  app.innerHTML = `
    <header class="cab">
      <div>
        <h1>Mantenimiento Líneas AT</h1>
        <p class="sub">Gestión del mantenimiento de líneas de alta tensión · Caribe colombiano</p>
      </div>
      <span class="fase">Fase 0 · fundación</span>
    </header>

    <div class="aviso">
      <b>Esta es una línea de demostración, inventada.</b> El sitio publicado no contiene ningún dato
      real de cliente: es el caparazón. Las líneas reales llegan por sincronización autenticada y
      nunca viajan dentro de lo que se publica en internet.
    </div>

    <section class="panel">
      <h2>Motor de cálculo, funcionando</h2>
      <div class="kpis">
        ${kpi(nf(apoyos.length), 'apoyos')}
        ${kpi(nf(longitud / 1000, 3) + ' km', 'longitud')}
        ${kpi(nf(L.length), 'vanos', 'medio ' + nf(longitud / L.length, 1) + ' m')}
        ${kpi(nf(vanoIdealRegulacion(L) ?? 0, 1) + ' m', 'VIR de la línea', 'pero se calcula por tramo')}
        ${kpi(nf(filas.length), 'tramos de tensión', anclas + ' anclajes')}
        ${kpi(nf(amp) + ' A', 'ampacidad IEEE 738', temperaturaLimite(c.material) + ' °C · 32 °C amb.')}
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
      ${dibujarTramos(filas, c, h)}
    </section>

    <footer class="pie">
      El sistema no certifica nada. Certifica el ingeniero que firma.
      El trabajo del sistema es hacer barato comprobar que ese ingeniero tiene razón.
    </footer>`;
}

montar();
