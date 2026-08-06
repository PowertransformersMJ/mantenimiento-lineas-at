// ============================================================================
// componentes/Contrasena.tsx — la única pantalla que se interpone antes de entrar
// ----------------------------------------------------------------------------
// QUÉ HACE Y QUÉ NO. Obliga a cambiar una contraseña que escribió otra persona
// —el administrador, al crear la cuenta— antes de dejar trabajar. Nada más.
//
// ⚠️ NO ES UNA FRONTERA DE SEGURIDAD, y está escrito aquí para que nadie lo
// confunda leyendo el código: el recibo lo escribe este mismo navegador, así que
// cualquiera con la consola abierta puede escribirlo sin cambiar nada — y el
// daño se lo hace a su propia cuenta. La frontera son las reglas de la base y
// el rol. Esta pantalla es HIGIENE.
//
// TODA la decisión de si aparece vive en `contratos/src/acceso.ts`, probada sin
// navegador. Aquí no hay ni un `if` sobre reclamos: este archivo solo pinta y
// llama. Si la lógica viviera en un componente, la única pantalla capaz de
// encerrar a una persona sería la única que no se puede probar.
// ============================================================================
import { useState } from 'react';
import {
  defectosDeContrasena, cambiarContrasena, motivoDelFallo, MIN_CONTRASENA,
} from '@lineas/contratos';
import { almacen } from '../datos/enlace';

export function Contrasena({ correo }: { correo: string }) {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  const defectos = nueva ? defectosDeContrasena(nueva, correo) : [];
  const coinciden = nueva.length > 0 && nueva === repetida;
  const listo = actual.length > 0 && defectos.length === 0 && coinciden && !trabajando;

  const enviar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!listo) return;
    setFallo(null);
    setTrabajando(true);
    try {
      const { cargarFirebase } = await import('../datos/cargar');
      const fb = await cargarFirebase();
      const u = await fb.esperarSesion();
      if (!u) { setFallo('La sesión se cerró. Vuelva a entrar.'); return; }

      const { EmailAuthProvider, reauthenticateWithCredential, updatePassword } =
        await import('firebase/auth');
      const { repositorio } = await import('../datos/repositorio');

      const r = await cambiarContrasena({
        // Se reautentica SIEMPRE, no solo cuando Firebase se queja. Rompe el
        // bucle «vuelva a entrar» y cierra el agujero del portátil abierto.
        reautenticar: () => reauthenticateWithCredential(
          u, EmailAuthProvider.credential(correo, actual),
        ).then(() => undefined),
        actualizar: () => updatePassword(u, nueva),
        dejarRecibo: () => repositorio.dejarReciboContrasena(),
      });

      if (r.fase === 'fallo') { setFallo(motivoDelFallo(r.codigo)); return; }
      // En `entrar_sin_recibo` se entra igual: la contraseña YA cambió, y negar
      // la entrada por no haber podido escribir una fecha sería castigar a la
      // persona por un fallo del sistema. La pantalla volverá la próxima vez.
      await almacen.cargar();
    } catch (e) {
      setFallo(e instanceof Error ? e.message : 'No se pudo cambiar la contraseña.');
    } finally {
      setTrabajando(false);
    }
  };

  const salir = async () => {
    const { cargarFirebase } = await import('../datos/cargar');
    await (await cargarFirebase()).salir();
    await almacen.cargar();
  };

  return (
    <section className="panel acceso">
      <h2>Cambie su contraseña antes de continuar</h2>
      <p>
        Su contraseña la escribió el administrador cuando creó su cuenta, así que la conoce otra
        persona. Mientras siga siendo ésa, <b>lo que usted firme en este sistema no es solo suyo</b>.
        Elija ahora una que no sepa nadie más.
      </p>
      <p className="fine">
        Es la única pantalla que se interpone antes de entrar, y solo aparece hasta que la cambie.
      </p>

      <form onSubmit={(e) => void enviar(e)}>
        <div className="calc-fila">
          <label className="calc-campo"><span>Contraseña actual</span>
            <input type="password" autoComplete="current-password" value={actual}
              onChange={(e) => setActual(e.target.value)} /></label>
        </div>
        <div className="calc-fila">
          <label className="calc-campo"><span>Contraseña nueva</span>
            <input type="password" autoComplete="new-password" value={nueva}
              onChange={(e) => setNueva(e.target.value)} /></label>
          <label className="calc-campo"><span>Repítala</span>
            <input type="password" autoComplete="new-password" value={repetida}
              onChange={(e) => setRepetida(e.target.value)} /></label>
        </div>

        <p className="fine">
          <b>Requisitos:</b> al menos {MIN_CONTRASENA} caracteres · letras y números, las dos cosas ·
          no puede contener su propio correo.
        </p>

        {/* Los defectos se enseñan MIENTRAS escribe, no al enviar: descubrir el
            requisito después de pulsar es lo que hace odiosas estas pantallas. */}
        {defectos.length > 0 && (
          <p className="aviso">La contraseña nueva {defectos.join(' · ')}.</p>
        )}
        {repetida.length > 0 && !coinciden && (
          <p className="aviso">Las dos no coinciden.</p>
        )}
        {fallo && <p className="alerta">{fallo}</p>}

        <div className="rca-guardar">
          <button type="submit" className="boton" disabled={!listo}>
            {trabajando ? 'Cambiando…' : 'Cambiar y entrar'}
          </button>
          {/* SIEMPRE hay salida. Una pantalla obligatoria sin puerta de atrás es
              una puerta que se cierra por dentro. */}
          <button type="button" className="boton chico" onClick={() => void salir()}>
            Salir sin cambiarla
          </button>
        </div>
      </form>
    </section>
  );
}
