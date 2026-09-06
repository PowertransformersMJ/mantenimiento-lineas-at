// ============================================================================
// componentes/Inicializar.tsx — la primera vez: el propietario arranca el sistema
// ----------------------------------------------------------------------------
// CUÁNDO APARECE. Cuando hay sesión y NO hay reclamos válidos. Son dos casos y
// solo el trabajador sabe cuál: (1) la cuenta que el Ingeniero acaba de crear
// en la consola de Firebase y que `POST /bootstrap` convierte en propietario;
// (2) una cuenta que nadie ha aprovisionado, a la que no le toca nada.
//
// ⚠️ LO QUE ESTA PANTALLA NO DECIDE: quién es el propietario. Eso lo comprueba
// el trabajador contra un uid configurado como secreto, contra el proveedor de
// entrada, contra la hora de la sesión y contra un cerrojo de un solo uso en la
// base (`99 §ADR-100`). Aquí solo se pulsa un botón y se lee la respuesta.
//
// ⚠️ DESPUÉS DE ARRANCAR, EL TOKEN SIGUE VIEJO hasta que se renueve. Por eso
// tras un 200 —y también tras un 409— se fuerza la relectura del token DOS
// veces; si sigue sin reclamos, se ofrece salir y volver a entrar. Nunca se
// manda al propietario a «pedir acceso al administrador»: es él.
// ============================================================================
import { useEffect, useState } from 'react';
import { almacen, useSesion } from '../datos/enlace';
import {
  arrancarSistema, estadoDelSistema, hayTrabajador, FalloDePersonas,
  type EstadoDelSistema, type ResultadoDeArranque,
} from '../datos/usuariosRemoto';
import { Estado } from './Estado';

export function Inicializar() {
  const sesion = useSesion();
  const [estado, setEstado] = useState<EstadoDelSistema | null | 'leyendo'>('leyendo');
  const [trabajando, setTrabajando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoDeArranque | null>(null);
  const [fallo, setFallo] = useState<{ estado: number; mensaje: string } | null>(null);
  const [sinPermisoTrasArrancar, setSinPermisoTrasArrancar] = useState(false);

  useEffect(() => { void estadoDelSistema().then(setEstado); }, []);

  const salir = async () => {
    const { cargarFirebase } = await import('../datos/cargar');
    await (await cargarFirebase()).salir();
    await almacen.cargar();
  };

  /**
   * PASO 1 — pedir el arranque, y PARARSE a enseñar lo que quedó escrito.
   *
   * ⚠️ AQUÍ NO SE RECARGA LA SESIÓN, y es deliberado. `recargarSesion()` mete
   * los reclamos nuevos en el estado, `App.tsx` deja de pintar esta pantalla en
   * ese mismo instante y el panel con el rol, la organización, las funciones y
   * el alcance desaparece antes de que a nadie le dé tiempo a leerlo. El comité
   * pidió justo lo contrario: que se VEAN antes de dar el paso por bueno
   * (`99 §ADR-100`, paso 6 del runbook). Así que el arranque acaba en una
   * pantalla que se lee, y seguir es un segundo gesto.
   */
  const arrancar = async () => {
    setTrabajando(true); setFallo(null); setSinPermisoTrasArrancar(false);
    try {
      setResultado(await arrancarSistema());
    } catch (e) {
      if (e instanceof FalloDePersonas) setFallo({ estado: e.estado, mensaje: e.message });
      else setFallo({ estado: 0, mensaje: e instanceof Error ? e.message : 'No se pudo arrancar.' });
      // ⚠️ SE VUELVE A PREGUNTAR EL ESTADO tras cualquier negativa. Un 409 dice
      // que el cerrojo ya está echado y un 403 que esta cuenta no es la
      // configurada: en los dos casos lo que esta pantalla tenía en la cabeza
      // («todavía no hay propietario») acaba de quedarse viejo, y sin releerlo
      // seguiría ofreciendo «Inicializar» y ocultando la única frase que aquí
      // sirve — que el sistema ya tiene dueño y el acceso se pide a quien lo
      // administra (`99 §ADR-100`, camino 2).
      void estadoDelSistema().then(setEstado);
      // Un 409 no es una avería: el arranque ya ocurrió. Se sigue ofreciendo
      // releer el token —cuesta nada y puede que los reclamos ya estén puestos
      // por otra vía—, con el aviso del trabajador a la vista.
      if (e instanceof FalloDePersonas && e.estado === 409) setResultado(null);
      else { setTrabajando(false); return; }
    }
    setTrabajando(false);
  };

  /**
   * PASO 2 — releer el token, DOS veces, sin rehacer el arranque.
   *
   * El token que el navegador tiene sigue siendo el de antes: los reclamos los
   * escribió el trabajador del otro lado. `getIdToken(true)` (dentro de
   * `recargarSesion`) es lo que los trae. Si tras dos intentos siguen vacíos, la
   * salida es salir y volver a entrar — NUNCA «pida acceso al administrador»,
   * porque quien está mirando esta pantalla es el administrador.
   */
  const continuar = async () => {
    setTrabajando(true); setSinPermisoTrasArrancar(false);
    for (let intento = 0; intento < 2; intento += 1) {
      await almacen.recargarSesion();
      const s = almacen.leerSesion();
      if (s.fase === 'autenticado' && s.claims !== null) { await almacen.cargar(); return; }
    }
    setSinPermisoTrasArrancar(true);
    setTrabajando(false);
  };

  /** Se ofrece continuar tras un 200 (reclamos nuevos) y tras un 409 (reparación). */
  const hayQueContinuar = resultado !== null || fallo?.estado === 409;

  const correo = sesion.fase === 'autenticado' ? sesion.correo : null;
  const arrancado = estado !== 'leyendo' && estado?.arrancado === true;

  return (
    <section className="panel acceso">
      <Estado
        titulo={arrancado ? 'Su cuenta no tiene permisos en este sistema' : 'Inicializar el sistema'}
        nota={correo ? `Sesión: ${correo}` : undefined}
      >
        {arrancado ? (
          <>El sistema ya tiene propietario. Si usted debe tener acceso, <b>pídaselo a quien lo
            administra</b>: nadie puede darse permisos por su cuenta.</>
        ) : (
          <>Esta cuenta existe pero <b>todavía no tiene permisos</b>. Si es la cuenta del propietario
            creada en la consola de Firebase, pulse «Inicializar»: el sistema comprobará que es la
            configurada, que entró con contraseña hace menos de cinco minutos, y la convertirá en
            propietario <b>una sola vez</b>.</>
        )}
      </Estado>

      {!hayTrabajador() && (
        <p className="alerta">El servicio de personas no está configurado en este despliegue.</p>
      )}
      {estado !== 'leyendo' && estado && !estado.configurado && (
        <p className="alerta">El arranque no está configurado en el servicio (falta el propietario).</p>
      )}

      {resultado && (
        <div className="usr-enlace" role="status">
          <p><b>{resultado.reparado ? 'Permisos reparados.' : 'Sistema inicializado.'}</b> Esto es lo que
            quedó escrito en su cuenta:</p>
          <ul className="fine">
            <li>Rol: <b>{resultado.reclamos.rol}</b></li>
            <li>Organización: <b>{resultado.reclamos.orgId}</b></li>
            <li>Funciones: {resultado.reclamos.f.join(', ')}</li>
            <li>Alcance: {resultado.reclamos.l.join(', ')}</li>
          </ul>
          <p className="fine">
            Compruébelo antes de seguir: es lo que las reglas de la base van a mirar en cada lectura
            y en cada escritura. Al pulsar «Continuar» se pide el token nuevo y entra al sistema.
          </p>
        </div>
      )}
      {fallo && <p className="alerta" role="alert">{fallo.mensaje}</p>}
      {/* ⚠️ ESTO ES LO ESPERABLE TRAS UN ARRANQUE BUENO, no una avería, y decirlo
          ahorra el susto: al estampar los reclamos el trabajador CORTA la sesión
          con la que se arrancó (`validSince`), justo para que la siguiente los
          traiga. O sea que el token de este navegador ya no vale y pedirlo otra
          vez no puede funcionar: la salida es volver a entrar. */}
      {sinPermisoTrasArrancar && (
        <p className="aviso">
          El token de su navegador sigue sin los permisos nuevos, y lo normal es que sea así: al
          arrancar, el servicio <b>corta la sesión anterior a propósito</b> para que la siguiente
          nazca ya con los permisos. <b>Salga y vuelva a entrar.</b> No hace falta volver a
          inicializar — el arranque es de un solo uso y ya está hecho.
        </p>
      )}

      <div className="rca-guardar">
        {!arrancado && !hayQueContinuar && (
          <button type="button" className="boton" disabled={trabajando || !hayTrabajador()} onClick={() => void arrancar()}>
            {trabajando ? 'Inicializando…' : 'Inicializar'}
          </button>
        )}
        {hayQueContinuar && (
          <button type="button" className="boton" disabled={trabajando} onClick={() => void continuar()}>
            {trabajando ? 'Pidiendo el token nuevo…' : 'Continuar'}
          </button>
        )}
        <button type="button" className="boton chico" onClick={() => void salir()}>Salir</button>
      </div>
    </section>
  );
}
