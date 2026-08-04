// ============================================================================
// componentes/Estado.tsx — los estados que NO son el camino feliz
// ----------------------------------------------------------------------------
// Existen desde el día 1 a propósito (ADR-004). Es exactamente donde el trabajo
// en paralelo se estrella: el frontend construye el camino feliz, el backend
// devuelve degradaciones, y juntarlos cuesta una semana de parches. Si la
// tarjeta de "apagado por presupuesto" está diseñada desde el principio, no hay
// choque.
// ============================================================================

import { useState } from 'react';

interface Props {
  titulo: string;
  children?: React.ReactNode;
  nota?: string;
  accion?: React.ReactNode;
}

export function Estado({ titulo, children, nota, accion }: Props) {
  return (
    <section className="panel vacio">
      <div className="vacio-t">{titulo}</div>
      {children && <p className="vacio-c">{children}</p>}
      {accion}
      {nota && <p className="fine">{nota}</p>}
    </section>
  );
}

/**
 * Acceso con correo y contraseña. NO hay registro, y su ausencia es el control:
 * las cuentas las crea el administrador con `herramientas/usuarios.mjs`.
 *
 * Google sigue de momento como salida de reserva, y está anunciado que se
 * retira. Se quita en cuanto la contraseña del administrador esté probada:
 * retirarlo antes lo dejaría a él fuera de su propio sistema.
 */
export function SinSesion({ onEntrar, onEntrarConGoogle }: {
  onEntrar: (correo: string, contrasena: string) => Promise<void>;
  onEntrarConGoogle?: () => void;
}) {
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [fallo, setFallo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enviando) return;
    setFallo(null);
    setEnviando(true);
    try {
      await onEntrar(correo, contrasena);
    } catch (err) {
      setFallo(err instanceof Error ? err.message : 'No se pudo entrar.');
      // La contraseña se borra al fallar: no se deja escrita en pantalla.
      setContrasena('');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="panel vacio">
      <div className="vacio-t">Acceso</div>
      <p className="vacio-c">
        Esta página no contiene ningún dato: las líneas reales se leen de la base después de
        autenticarse. Es deliberado — el sitio es público, y las coordenadas de la infraestructura
        de un cliente no pueden viajar dentro de lo que se publica en internet.
      </p>

      <form className="acceso" onSubmit={(e) => void enviar(e)}>
        <label className="acceso-campo">
          <span>Correo</span>
          <input type="email" autoComplete="username" required value={correo}
            onChange={(e) => setCorreo(e.target.value)} disabled={enviando} />
        </label>
        <label className="acceso-campo">
          <span>Contraseña</span>
          <input type="password" autoComplete="current-password" required value={contrasena}
            onChange={(e) => setContrasena(e.target.value)} disabled={enviando} />
        </label>
        {fallo && <p className="acceso-fallo" role="alert">{fallo}</p>}
        <button className="boton" type="submit" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      <p className="fine">
        <b>No hay registro.</b> Las cuentas las crea el administrador. Si necesita acceso o ha
        olvidado su contraseña, avísele: nadie puede darse de alta por su cuenta.
      </p>

      {onEntrarConGoogle && (
        <p className="fine acceso-reserva">
          <button className="boton chico" type="button" onClick={onEntrarConGoogle}>
            Entrar con Google
          </button>
          {' '}Vía en retirada, disponible mientras se completa el cambio a contraseña.
        </p>
      )}
    </section>
  );
}

export function Cargando() {
  return <Estado titulo="Cargando…">Leyendo la línea desde la base.</Estado>;
}

export function Vacio() {
  return (
    <Estado titulo="No hay líneas asignadas" nota="Si esto no es lo que espera, avise al administrador.">
      Su usuario está autenticado pero todavía no tiene ninguna línea asignada.
    </Estado>
  );
}

export function Error_({ mensaje, onReintentar }: { mensaje: string; onReintentar?: () => void }) {
  return (
    <Estado
      titulo="No se pudo cargar"
      nota="El dato no se perdió: solo no se pudo leer ahora."
      accion={onReintentar && <button className="boton" onClick={onReintentar}>Reintentar</button>}
    >
      {mensaje}
    </Estado>
  );
}

/** Quinto estado, el que casi nadie dibuja hasta que es tarde (ADR-004 §5). */
export function ApagadoPorPresupuesto({ vuelve }: { vuelve?: string }) {
  return (
    <Estado
      titulo="Análisis con IA apagado por presupuesto"
      nota={vuelve ? `Se reactiva ${vuelve}.` : 'Se reactiva al iniciar el siguiente periodo.'}
    >
      Se alcanzó el tope de gasto del día. <b>El sistema sigue funcionando igual</b>: el cálculo, las
      fichas y los informes no dependen de la IA. Solo quedan en pausa las sugerencias automáticas.
    </Estado>
  );
}
