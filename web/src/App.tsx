// ============================================================================
// App.tsx — raíz de la aplicación
// ----------------------------------------------------------------------------
// React se usa ÚNICAMENTE para pintar (ADR-005). Aquí no hay lógica de negocio:
// se lee el estado del almacén, se elige qué pantalla toca, y ya.
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { VERSION_CONTRATO } from '@lineas/contratos';
import { derivarLevantamiento } from '@lineas/exportar/levantamiento';
import { useDatos, useRca, almacen } from './datos/enlace';
import { Rca } from './componentes/Rca';
import { Contrasena } from './componentes/Contrasena';
import { SinSesion, Cargando, Vacio, Error_ } from './componentes/Estado';
import { VistaLinea } from './componentes/Linea';

/**
 * Quién está adentro y cómo salir. En una demostración, no poder cerrar sesión
 * obliga a usar una ventana privada — inadmisible en un producto serio.
 */
function Sesion() {
  const d = useDatos();
  const [correo, setCorreo] = useState<string | null>(null);

  // ⚠️ LA SESIÓN Y LOS DATOS SON DOS COSAS DISTINTAS, y confundirlas dejaba al
  // usuario encerrado. Esto solo preguntaba por la sesión en las fases `listo` y
  // `vacio`; en cualquier otra —`error`, `cargando`— ponía el correo en null y
  // el botón «Salir» desaparecía. O sea que la ÚNICA pantalla donde de verdad
  // hace falta poder salir —la que dice que algo va mal— era justo donde no
  // había salida: ni cerrar sesión, ni cambiar de usuario, ni reintentar limpio.
  //
  // Se pregunta SIEMPRE. Si no hay sesión, `esperarSesion` devuelve null y el
  // botón no se dibuja igual; pero si la hay, se puede salir pase lo que pase
  // con los datos.
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const { cargarFirebase } = await import('./datos/cargar');
        const { esperarSesion } = await cargarFirebase();
        const u = await esperarSesion();
        if (vivo) setCorreo(u?.email ?? null);
      } catch {
        if (vivo) setCorreo(null);   // sin sesión que mostrar
      }
    })();
    return () => { vivo = false; };
  }, [d.fase]);

  if (!correo) return null;

  const salir = async () => {
    const { cargarFirebase } = await import('./datos/cargar');
    await (await cargarFirebase()).salir();
    await almacen.cargar();     // vuelve solo a la pantalla de acceso
  };

  return (
    <span className="sesion">
      {correo}
      <button type="button" className="salir" onClick={() => void salir()}>Salir</button>
    </span>
  );
}

const nf = (v: number, d = 0) =>
  v.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });

/**
 * Barra de instrumento, no portada. Réplica de la cabecera del módulo
 * original: identidad a la izquierda, procedencia del levantamiento debajo con
 * su filete ámbar, y las cifras de la línea alineadas a la derecha. Cuando no
 * hay línea cargada, esa parte sencillamente no se pinta — no se inventa.
 */
function Cabecera() {
  const d = useDatos();

  const resumen = useMemo(() => {
    if (d.fase !== 'listo') return null;
    const lev = derivarLevantamiento(d.apoyos);
    return {
      codigo: d.linea.codigo,
      kV: d.linea.tensionNominal_kV,
      estructuras: lev.nEstructuras,
      empalmes: lev.nEmpalmes,
      longitud: lev.longitud_m,
      metodo: lev.puntos.find((p) => p.metodo)?.metodo,
      sistema: lev.puntos[0]?.sistemaReferencia,
      jornadas: [...new Set(lev.puntos.map((p) => p.local?.slice(0, 10)).filter(Boolean))],
    };
  }, [d]);

  return (
    <header className="cab">
      <div>
        <h1>Mantenimiento Líneas AT</h1>
        <p className="sub">Gestión del mantenimiento de líneas de alta tensión · Caribe colombiano</p>
        {resumen && (
          <p className="resp">
            <b>{resumen.codigo}</b> — levantamiento
            {resumen.metodo === 'gps_mano' ? ' con GPS de mano' : ''}
            {resumen.jornadas.length ? ` · ${resumen.jornadas.join(' y ')}` : ''}
            {resumen.sistema ? ` · datum ${resumen.sistema}` : ''}
          </p>
        )}
      </div>
      <div className="cab-der">
        <Sesion />
        {resumen && (
          <p className="stat">
            <b>{nf(resumen.estructuras)}</b> estructuras · <b>{nf(resumen.empalmes)}</b> empalmes ·{' '}
            <b>{nf(resumen.longitud)} m</b> · <b>{nf(resumen.kV)} kV</b>
          </p>
        )}
        <button type="button" className="boton chico ir-rca" onClick={() => void almacen.abrirRca()}>
          Análisis de causa raíz
        </button>
        <span className="fase">Fase 0 · fundación</span>
      </div>
    </header>
  );
}

function Pie() {
  return (
    <footer className="pie">
      El sistema no certifica nada. Certifica el ingeniero que firma.
      El trabajo del sistema es hacer barato comprobar que ese ingeniero tiene razón.
      <span className="ver">contrato v{VERSION_CONTRATO} · los cálculos declaran su motor e hipótesis en cada tabla</span>
    </footer>
  );
}

function Contenido() {
  const d = useDatos();
  const rca = useRca();

  /**
   * Acceso con correo y contraseña — la vía definitiva.
   *
   * El fallo NO va al estado global: se devuelve al formulario, que lo pinta
   * junto a los campos. Mandar «correo o contraseña incorrectos» a la pantalla
   * de error general obligaría a recargar para reintentar, y además borraría
   * de la vista lo que la persona acaba de escribir.
   */
  async function entrar(correo: string, contrasena: string) {
    // El SDK de Firebase pesa cerca de 1 MB. Se carga SOLO cuando alguien va
    // a entrar, no al abrir la página: la cuadrilla no debe pagar esa
    // descarga con dos rayas de señal para ver una pantalla de acceso.
    const { cargarFirebase } = await import('./datos/cargar');
    const { entrarConContrasena, motivoDeFallo } = await cargarFirebase();
    try {
      await entrarConContrasena(correo, contrasena);
    } catch (e) {
      throw new Error(motivoDeFallo(e));
    }
    await almacen.cargar();
  }

  /** Salida de reserva mientras se completa el cambio. Se retira después. */
  async function entrarConGoogle() {
    try {
      const { cargarFirebase } = await import('./datos/cargar');
      const f = await cargarFirebase();
      await f.entrarConGoogle();
      await almacen.cargar();
    } catch (e) {
      almacen.poner({ fase: 'error', mensaje: e instanceof Error ? e.message : 'no se pudo iniciar sesión' });
    }
  }

  // El segmento RCA se pinta ENCIMA de la línea, sin destruirla: volver al
  // parque es instantáneo porque la línea nunca se descargó de memoria.
  if (rca.fase !== 'cerrado') return <Rca />;

  switch (d.fase) {
    case 'sin_sesion': return <SinSesion onEntrar={entrar} onEntrarConGoogle={() => void entrarConGoogle()} />;
    case 'cargando':   return <Cargando />;
    case 'vacio':      return <Vacio />;
    case 'error':      return <Error_ mensaje={d.mensaje} onReintentar={() => void almacen.cargar()} />;
    // No es una ruta: es una fase. Y este `switch` NO tiene caso por defecto a
    // propósito — añadir una fase OBLIGA a tratarla aquí o la compilación se
    // cae. El compilador vigila el olvido.
    case 'cambiar_contrasena': return <Contrasena correo={d.correo} />;
    case 'listo':      return <VistaLinea {...d} />;
  }
}

export function App() {
  useEffect(() => { void almacen.cargar(); }, []);

  return (
    <>
      <Cabecera />
      <main className="contenido"><Contenido /></main>
      <Pie />
    </>
  );
}
