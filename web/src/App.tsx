// ============================================================================
// App.tsx — raíz de la aplicación
// ----------------------------------------------------------------------------
// React se usa ÚNICAMENTE para pintar (ADR-005). Aquí no hay lógica de negocio:
// se lee el estado del almacén, se elige qué pantalla toca, y ya.
// ============================================================================
import { useEffect, useState } from 'react';
import { VERSION_CONTRATO } from '@lineas/contratos';
import { useDatos, almacen } from './datos/enlace';
import { SinSesion, Cargando, Vacio, Error_ } from './componentes/Estado';
import { VistaLinea } from './componentes/Linea';

/**
 * Quién está adentro y cómo salir. En una demostración, no poder cerrar sesión
 * obliga a usar una ventana privada — inadmisible en un producto serio.
 */
function Sesion() {
  const d = useDatos();
  const [correo, setCorreo] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    if (d.fase === 'listo' || d.fase === 'vacio') {
      void (async () => {
        try {
          const { cargarFirebase } = await import('./datos/cargar');
          const { esperarSesion } = await cargarFirebase();
          const u = await esperarSesion();
          if (vivo) setCorreo(u?.email ?? null);
        } catch { /* sin sesión que mostrar */ }
      })();
    } else {
      setCorreo(null);
    }
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

function Cabecera() {
  return (
    <header className="cab">
      <div>
        <h1>Mantenimiento Líneas AT</h1>
        <p className="sub">Gestión del mantenimiento de líneas de alta tensión · Caribe colombiano</p>
      </div>
      <div className="cab-der">
        <Sesion />
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

  async function entrar() {
    try {
      // El SDK de Firebase pesa cerca de 1 MB. Se carga SOLO cuando alguien va
      // a entrar, no al abrir la página: la cuadrilla no debe pagar esa
      // descarga con dos rayas de señal para ver una pantalla de acceso.
      const { cargarFirebase } = await import('./datos/cargar');
      const { entrarConGoogle } = await cargarFirebase();
      await entrarConGoogle();
      await almacen.cargar();
    } catch (e) {
      // Un fallo de inicio de sesión NO deja la pantalla en blanco: se dice.
      almacen.poner({ fase: 'error', mensaje: e instanceof Error ? e.message : 'no se pudo iniciar sesión' });
    }
  }

  switch (d.fase) {
    case 'sin_sesion': return <SinSesion onEntrar={entrar} />;
    case 'cargando':   return <Cargando />;
    case 'vacio':      return <Vacio />;
    case 'error':      return <Error_ mensaje={d.mensaje} onReintentar={() => void almacen.cargar()} />;
    case 'listo':      return <VistaLinea {...d} />;
  }
}

export function App() {
  useEffect(() => { void almacen.cargar(); }, []);

  return (
    <>
      <Cabecera />
      <Contenido />
      <Pie />
    </>
  );
}
