// ============================================================================
// App.tsx — raíz de la aplicación
// ----------------------------------------------------------------------------
// React se usa ÚNICAMENTE para pintar (ADR-005). Aquí no hay lógica de negocio:
// se lee el estado del almacén, se elige qué pantalla toca, y ya.
// ============================================================================
import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { VERSION_CONTRATO } from '@lineas/contratos';
import { derivarLevantamiento } from '@lineas/exportar/levantamiento';
import { useAtlas, useDatos, useRca, almacen } from './datos/enlace';
import { Rca } from './componentes/Rca';
import { conReintentos } from './datos/cargar';
// ⚠️ EN DIFERIDO, y no por elegancia: el atlas arrastra MapLibre (cerca de un
// mega) y es una pantalla que la mayoría de las sesiones no abre nunca. Con el
// import en directo, MEDIDO, el paquete de entrada pasaba de 820 kB a 1.844 kB —
// o sea que la cuadrilla se descargaba MapLibre para ver la pantalla de acceso.
// `conReintentos` y no un `import()` pelado: `datos/cargar.ts` es la ÚNICA
// frontera de carga diferida del sistema, por un fallo que ya ocurrió en
// producción (un trozo tardó, el navegador falló una vez, la página se quedó en
// blanco para siempre).
const AtlasCaribe = lazy(() => conReintentos(() => import('./componentes/AtlasCaribe'))
  .then((m) => ({ default: m.AtlasCaribe })));
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
        {/* Los atlas NO son de esta línea: son del Caribe. Por eso viven en la
            cabecera, al lado del segmento de causa raíz, y no como pestañas.
            También se abren desde «Detalle GPS», con la línea marcada dentro.

            UN SOLO BOTÓN para los cuatro: con uno por atlas la cabecera se
            llenaba, y para comparar el sol de un día con su viento había que
            salir y volver a entrar. Se entra por el solar —el primero que
            existió— y dentro se cambia sin salir. */}
        <button type="button" className="boton chico" onClick={() => almacen.abrirAtlas('sol')}>
          Atlas del Caribe
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
  const atlas = useAtlas();

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

  // El atlas solar, igual: encima y sin destruir nada. Va DESPUÉS del RCA porque
  // si los dos estuvieran abiertos manda el que se abrió con la dirección, y el
  // RCA es el que lee de la base.
  //
  // ⚠️ EXIGE SESIÓN, aunque su dato sea PÚBLICO (NASA POWER y OpenStreetMap) y
  // no traiga un solo byte de cliente. Sin esta guarda, pegar `#/sol` abriría
  // una pantalla real de la aplicación a cualquiera que tuviera la dirección —
  // y esa es una decisión de producto que no toma un `if` colocado sin pensar.
  // El día que se quiera un atlas público, se decide y se documenta.
  if (atlas && d.fase !== 'sin_sesion' && d.fase !== 'cambiar_contrasena') {
    return (
      <Suspense fallback={<Cargando />}>
        {/* ⚠️ LA LÍNEA VIAJA AL ATLAS (`§ADR-069`). Desde que el clima vive aquí
            y no en Detalle GPS, esta pantalla necesita saber por dónde pasa el
            recorrido: para dibujarlo, para comprobar cuántas celdas toca y para
            pedir el pronóstico de su punto. Va OPCIONAL a propósito — el atlas
            se abre con `#/sol` sin línea cargada y tiene que seguir sirviendo
            como atlas de la región. */}
        {/* ⚠️ Y LA HIPÓTESIS TAMBIÉN (`§ADR-087`): la leyenda de la temperatura
            del corredor compara la media del sitio con la EDS adoptada, y esa
            comparación es la razón de mirar esa capa. Sin línea cargada no hay
            hipótesis y simplemente no se compara — que es lo honesto. */}
        <AtlasCaribe atlas={atlas} alCambiarAtlas={(c) => almacen.abrirAtlas(c)}
          hipotesis={d.fase === 'listo' ? d.hipotesis : null}
          linea={d.fase === 'listo'
            ? { codigo: d.linea.codigo, apoyos: d.apoyos }
            : undefined} />
      </Suspense>
    );
  }

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

  // Atrás/Adelante, a nivel de APLICACIÓN. Antes el único oyente vivía dentro
  // de la vista de línea, así que al entrar al segmento de causa raíz —que la
  // sustituye— el botón Atrás dejaba de mover nada, y agotados sus pasos sacaba
  // de la aplicación con el trabajo dentro.
  useEffect(() => {
    const alVolver = () => { void almacen.sincronizarConRuta(); };
    addEventListener('popstate', alVolver);
    return () => removeEventListener('popstate', alVolver);
  }, []);

  return (
    <>
      <Cabecera />
      <main className="contenido"><Contenido /></main>
      <Pie />
    </>
  );
}
