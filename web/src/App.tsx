// ============================================================================
// App.tsx — raíz de la aplicación
// ----------------------------------------------------------------------------
// React se usa ÚNICAMENTE para pintar (ADR-005). Aquí no hay lógica de negocio:
// se lee el estado del almacén, se elige qué pantalla toca, y ya.
// ============================================================================
import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { PROVEEDOR_CONTRASENA, VERSION_CONTRATO } from '@lineas/contratos';
import { derivarLevantamiento } from '@lineas/exportar/levantamiento';
import { useAtlas, useDatos, useMotivoDeSalida, usePersonas, useQuien, useRca, useSesion, almacen } from './datos/enlace';
import { puede } from './datos/permisos';
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
import { Contrasena, CambiarMiContrasena } from './componentes/Contrasena';
import { SinSesion, Cargando, Vacio, Error_ } from './componentes/Estado';
import { VistaLinea } from './componentes/Linea';
import { Inicializar } from './componentes/Inicializar';
import { RelojDeSesion } from './componentes/RelojDeSesion';
// ⚠️ EN DIFERIDO, como el atlas: la administración de personas la abre una
// persona de cada diez, y arrastra su propio formulario y su bitácora. Quien
// nunca la abre no baja un byte de eso.
const Usuarios = lazy(() => conReintentos(() => import('./componentes/Usuarios'))
  .then((m) => ({ default: m.Usuarios })));

/**
 * Quién está adentro y cómo salir. En una demostración, no poder cerrar sesión
 * obliga a usar una ventana privada — inadmisible en un producto serio.
 */
function Sesion() {
  const d = useDatos();
  const [correo, setCorreo] = useState<string | null>(null);
  /**
   * CON QUÉ ENTRÓ esta sesión. Lo estampa Firebase en el token y no lo
   * aprovisiona nadie, así que es el cerrojo fuerte: quien no entró con
   * contraseña no tiene contraseña que cambiar.
   *
   * ⚠️ `null` significa «no se pudo leer», y ahí el botón SE SIGUE ENSEÑANDO. Es
   * la regla de la casa (`35 · L-11`): una capa de comodidad no tiene veto sobre
   * una esencial. Esconder el autoservicio por un token que tardó dejaría a la
   * persona sin poder cambiar su contraseña sin ganar nada — el formulario exige
   * la actual de todas formas, así que no esconde ninguna barrera.
   */
  const [proveedor, setProveedor] = useState<string | null>(null);

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
        const { esperarSesion, reclamosDeSesion } = await cargarFirebase();
        const u = await esperarSesion();
        if (!vivo) return;
        setCorreo(u?.email ?? null);
        const prov = u ? (await reclamosDeSesion(u)).proveedor : null;
        if (vivo) setProveedor(prov);
      } catch {
        if (vivo) { setCorreo(null); setProveedor(null); }   // sin sesión que mostrar
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
      {/* La cuenta propia: cambiar la contraseña EN EL NAVEGADOR, con la actual
          delante (`99 §ADR-100`). Para CUALQUIER persona que entre con
          contraseña — que desde el corte de acceso son todas. Se esconde solo
          cuando se SABE que entró de otra forma; con el proveedor ilegible se
          enseña igual (ver arriba). */}
      {proveedor !== null && proveedor !== PROVEEDOR_CONTRASENA
        ? null
        : <CambiarMiContrasena correo={correo} />}
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
  const quien = useQuien();

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
        {/* ⚠️ LA BARRA DE INSTRUMENTO NO SE PINTA EN LA PUERTA. Estos mandos
            colgaban de la cabecera sin condición ninguna, así que aparecían en
            la PANTALLA DE ACCESO, antes de que nadie hubiera entrado —lo vio el
            Ingeniero el 2026-09-06—. Y no era solo ruido: «Atlas del Caribe»
            llevaba a una pantalla que EXIGE sesión (más abajo), o sea un botón
            que devolvía al mismo sitio del que salía.

            `lineas.ver` es la llave correcta y no una elegida por cómoda: la
            traen los CINCO roles, así que no le esconde nada a nadie que haya
            entrado; y es exactamente la que piden las reglas para leer análisis
            (`firestore.rules`, `match /analisis`). Sin reclamos —la cuenta
            recién creada que va a «Inicializar»— tampoco se pinta, que es lo
            honesto: ahí todavía no se puede abrir nada.

            Esconderlo sigue siendo COSMÉTICO, como en «Personas»: quien decide
            de verdad son las reglas y el trabajador, que miran el mismo token
            del otro lado. Esto quita un estorbo, no pone una frontera. */}
        {puede(quien, 'lineas.ver') && (
          <>
            <button type="button" className="boton chico ir-rca" onClick={() => void almacen.abrirRca()}>
              Análisis de causa raíz
            </button>
            {/* Los atlas NO son de esta línea: son del Caribe. Por eso viven en
                la cabecera, al lado del segmento de causa raíz, y no como
                pestañas. También se abren desde «Detalle GPS», con la línea
                marcada dentro.

                UN SOLO BOTÓN para los cuatro: con uno por atlas la cabecera se
                llenaba, y para comparar el sol de un día con su viento había que
                salir y volver a entrar. Se entra por el solar —el primero que
                existió— y dentro se cambia sin salir. */}
            <button type="button" className="boton chico" onClick={() => almacen.abrirAtlas('sol')}>
              Atlas del Caribe
            </button>
          </>
        )}
        {/* PERSONAS es de ORGANIZACIÓN, no de línea: por eso está aquí arriba y
            no entre las pestañas. Tiene que poder abrirse cuando todavía no hay
            ninguna línea cargada — que es justo el día en que hay que dar de
            alta a la primera cuadrilla.

            Esconderlo es COSMÉTICO: quien decide de verdad son el trabajador y
            las reglas, que miran el mismo token del otro lado. */}
        {puede(quien, 'usuarios.gestionar') && (
          <button type="button" className="boton chico" onClick={() => almacen.abrirPersonas()}>
            Personas
          </button>
        )}
        {/* El sello de fase describe EL SISTEMA POR DENTRO. En la puerta no
            significa nada para quien todavía no ha entrado, así que se va con
            el resto de la barra. */}
        {puede(quien, 'lineas.ver') && <span className="fase">Fase 0 · fundación</span>}
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
  const personas = usePersonas();
  const sesion = useSesion();
  const motivoDeSalida = useMotivoDeSalida();

  /**
   * Acceso con correo y contraseña — la vía definitiva.
   *
   * El fallo NO va al estado global: se devuelve al formulario, que lo pinta
   * junto a los campos. Mandar «correo o contraseña incorrectos» a la pantalla
   * de error general obligaría a recargar para reintentar, y además borraría
   * de la vista lo que la persona acaba de escribir.
   */
  async function entrar(correo: string, contrasena: string, recordar: boolean) {
    // El SDK de Firebase pesa cerca de 1 MB. Se carga SOLO cuando alguien va
    // a entrar, no al abrir la página: la cuadrilla no debe pagar esa
    // descarga con dos rayas de señal para ver una pantalla de acceso.
    const { cargarFirebase } = await import('./datos/cargar');
    const { entrarConContrasena, motivoDeFallo } = await cargarFirebase();
    try {
      await entrarConContrasena(correo, contrasena, recordar);
    } catch (e) {
      throw new Error(motivoDeFallo(e));
    }
    // Quien vuelve a entrar ya no necesita leer por qué se cerró la anterior.
    almacen.olvidarMotivoDeSalida();
    await almacen.cargar();
  }

  /** «Olvidé mi contraseña»: una sola frase, exista o no el correo. */
  async function recuperar(correo: string): Promise<string> {
    const { cargarFirebase } = await import('./datos/cargar');
    const { pedirEnlaceDeRecuperacion } = await cargarFirebase();
    return pedirEnlaceDeRecuperacion(correo);
  }

  // El segmento RCA se pinta ENCIMA de la línea, sin destruirla: volver al
  // parque es instantáneo porque la línea nunca se descargó de memoria.
  //
  // ⚠️ Y EXIGE SESIÓN, por la misma razón que el atlas de aquí abajo — el
  // guardián se le puso a uno y no al otro, que es el patrón que domina este
  // repo: «arreglado donde se veía, vivo en la pieza hermana» (`10`). Sin esta
  // guarda, pegar `#/rca` abría una pantalla real de la aplicación a quien
  // tuviera la dirección; y con la contraseña por cambiar, el botón de la
  // cabecera SALTABA ese muro, que por eso dejaba de ser un muro. Las reglas
  // habrían negado el dato igual: esto cierra la pantalla, no la frontera.
  if (rca.fase !== 'cerrado' && d.fase !== 'sin_sesion' && d.fase !== 'cambiar_contrasena') {
    return <Rca />;
  }

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

  // ⚠️ INICIALIZAR SISTEMA, y se decide mirando la SESIÓN, no los datos: una
  // sesión autenticada sin reclamos válidos es la cuenta recién creada en la
  // consola (o una que nadie aprovisionó). Sin esta guarda, esa persona caía en
  // la pantalla de ERROR de línea con un «Reintentar» que no lleva a ninguna
  // parte — lo midió el comité del delta (`99 §ADR-100`).
  if (sesion.fase === 'autenticado' && sesion.claims === null && d.fase !== 'cambiar_contrasena') {
    return <Inicializar />;
  }

  // PERSONAS, encima de todo lo demás y ANTES del `switch`: es de organización
  // y tiene que poder abrirse cuando la línea está vacía o dio error — que es
  // exactamente cuando hay que dar de alta a alguien o revisar su alcance. Con
  // el `switch` delante, la pantalla de «no hay líneas» se la habría comido.
  if (personas && sesion.fase === 'autenticado' && d.fase !== 'cambiar_contrasena') {
    return <Suspense fallback={<Cargando />}><Usuarios /></Suspense>;
  }

  switch (d.fase) {
    case 'sin_sesion': return (
      <SinSesion onEntrar={entrar} onRecuperar={recuperar} motivoDeSalida={motivoDeSalida} />
    );
    case 'cargando':   return <Cargando />;
    // El motivo de que no haya nada que abrir son DOS, y solo el alcance de la
    // sesión sabe cuál: con `['*']` no hay líneas cargadas; con una lista, no
    // hay ninguna suya. Antes se afirmaba siempre lo segundo.
    case 'vacio':      return (
      <Vacio alcanzaTodas={sesion.fase === 'autenticado' && (sesion.claims?.l?.includes('*') ?? false)} />
    );
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
      {/* El reloj vive en la RAÍZ, no dentro de una pantalla: si viviera en la
          vista de línea, abrir el atlas o el segmento de causa raíz lo
          desmontaría y la sesión dejaría de caducar sin que nada avisara —
          exactamente cómo otro sistema perdió su corte de 30 minutos. */}
      <RelojDeSesion />
      <Cabecera />
      <main className="contenido"><Contenido /></main>
      <Pie />
    </>
  );
}
