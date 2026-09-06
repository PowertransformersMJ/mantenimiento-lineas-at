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

  const arrancar = async () => {
    setTrabajando(true); setFallo(null); setSinPermisoTrasArrancar(false);
    try {
      const r = await arrancarSistema();
      setResultado(r);
    } catch (e) {
      if (e instanceof FalloDePersonas) setFallo({ estado: e.estado, mensaje: e.message });
      else setFallo({ estado: 0, mensaje: e instanceof Error ? e.message : 'No se pudo arrancar.' });
      if (!(e instanceof FalloDePersonas && e.estado === 409)) { setTrabajando(false); return; }
    }
    // Tras 200 y tras 409 por igual: releer el token, dos veces, sin rehacer el arranque.
    for (let intento = 0; intento < 2; intento += 1) {
      await almacen.recargarSesion();
      const s = almacen.leerSesion();
      if (s.fase === 'autenticado' && s.claims !== null) { await almacen.cargar(); return; }
    }
    setSinPermisoTrasArrancar(true);
    setTrabajando(false);
  };

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
        </div>
      )}
      {fallo && <p className="alerta" role="alert">{fallo.mensaje}</p>}
      {sinPermisoTrasArrancar && (
        <p className="aviso">
          El token de su navegador sigue sin los permisos nuevos. <b>Salga y vuelva a entrar</b>;
          no vuelva a pulsar «Inicializar».
        </p>
      )}

      <div className="rca-guardar">
        {!arrancado && (
          <button type="button" className="boton" disabled={trabajando || !hayTrabajador()} onClick={() => void arrancar()}>
            {trabajando ? 'Inicializando…' : 'Inicializar'}
          </button>
        )}
        <button type="button" className="boton chico" onClick={() => void salir()}>Salir</button>
      </div>
    </section>
  );
}
