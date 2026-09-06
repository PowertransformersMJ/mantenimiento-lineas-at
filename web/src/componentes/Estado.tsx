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
 * Acceso con correo y contraseña. ÚNICO proveedor desde el 2026-09-06: «Entrar
 * con Google» se retiró por orden del Ingeniero (`99 §ADR-100`) — era una vía de
 * alta pública. NO hay registro: las cuentas las crea quien administra personas
 * desde la propia herramienta.
 *
 * «¿Olvidó su contraseña?» responde SIEMPRE lo mismo, exista o no el correo.
 */
export function SinSesion({ onEntrar, onRecuperar, motivoDeSalida }: {
  onEntrar: (correo: string, contrasena: string, recordar: boolean) => Promise<void>;
  /** Pide el enlace de recuperación. Devuelve la frase única que se enseña. */
  onRecuperar?: (correo: string) => Promise<string>;
  /** Por qué se cerró la sesión anterior. Sin esto, una caducidad parece avería. */
  motivoDeSalida?: string | null;
}) {
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [fallo, setFallo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  /**
   * DÓNDE SE GUARDA LA SESIÓN, y arranca en NO.
   *
   * El defecto conservador es que la sesión muera al cerrar el navegador: un
   * portátil de oficina o un teléfono prestado no deben dejar la herramienta
   * abierta para el siguiente. Quien la marca sabe lo que hace y en qué aparato.
   */
  const [recordar, setRecordar] = useState(false);
  const [recuperacion, setRecuperacion] = useState<string | null>(null);

  const recuperar = async () => {
    if (!onRecuperar || !correo.trim()) {
      setRecuperacion('Escriba su correo arriba y vuelva a pulsar.');
      return;
    }
    setRecuperacion(await onRecuperar(correo));
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enviando) return;
    setFallo(null);
    setEnviando(true);
    try {
      await onEntrar(correo, contrasena, recordar);
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
      {/* Por qué se cerró la anterior. Una sesión que caduca sin decirlo es
          indistinguible de una avería, y quien la sufre recarga la página tres
          veces antes de pensar en volver a entrar. */}
      {motivoDeSalida && <p className="aviso" role="status">{motivoDeSalida}</p>}
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
        <label className="acceso-recordar">
          <input type="checkbox" checked={recordar} disabled={enviando}
            onChange={(e) => setRecordar(e.target.checked)} />
          <span>
            Recordar en este dispositivo
            <b className="fine"> — solo si el aparato es suyo: sin marcarla, la sesión se cierra
            al cerrar el navegador.</b>
          </span>
        </label>
        {fallo && <p className="acceso-fallo" role="alert">{fallo}</p>}
        <button className="boton" type="submit" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      <p className="fine">
        <b>No hay registro.</b> Las cuentas las crea el administrador: nadie puede darse de alta
        por su cuenta.{' '}
        {onRecuperar && (
          <button className="boton chico" type="button" onClick={() => void recuperar()} disabled={enviando}>
            ¿Olvidó su contraseña?
          </button>
        )}
      </p>
      {/* Una sola frase, exista o no el correo: lo contrario enumera cuentas. */}
      {recuperacion && <p className="fine" role="status">{recuperacion}</p>}
    </section>
  );
}

export function Cargando() {
  return <Estado titulo="Cargando…">Leyendo la línea desde la base.</Estado>;
}

/**
 * NO HAY NADA QUE ABRIR — y por qué, que son DOS motivos distintos.
 *
 * ⚠️ Hasta hoy esta pantalla decía siempre «no tiene ninguna línea asignada», y
 * era una promesa sin nada detrás: **el alcance por líneas no existía**. Quien
 * la leía se iba a pedirle al administrador que le asignara una línea, y el
 * administrador no tenía dónde asignarla. Ahora el alcance existe de verdad
 * (`l` en el token), así que hay dos situaciones y solo una de ellas es ésa:
 *
 *   · alcance a TODAS  → no hay ninguna línea cargada todavía en la organización;
 *   · alcance a UNAS   → sí las hay, pero ninguna de las suyas se pudo abrir.
 *
 * Un campo que la pantalla ofrece y nadie hace cumplir es una mentira; una frase
 * que promete un mecanismo que no existe, también.
 */
export function Vacio({ alcanzaTodas }: { alcanzaTodas?: boolean }) {
  if (alcanzaTodas) {
    return (
      <Estado
        titulo="Todavía no hay ninguna línea"
        nota="Si esperaba ver una, avise al administrador: puede que el trazado aún no se haya cargado."
      >
        Su usuario alcanza <b>todas las líneas de su organización</b>, y ahora mismo no hay ninguna
        cargada. No es un problema de permiso.
      </Estado>
    );
  }
  return (
    <Estado
      titulo="No hay líneas asignadas"
      nota="Si esto no es lo que espera, avise al administrador: es él quien decide sobre qué líneas actúa cada cuenta."
    >
      Su usuario está autenticado, pero <b>ninguna de las líneas asignadas a su cuenta</b> se pudo
      abrir. El alcance de una cuenta se declara por línea: puede que aún no le hayan asignado
      ninguna.
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
