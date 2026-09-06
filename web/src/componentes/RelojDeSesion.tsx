// ============================================================================
// componentes/RelojDeSesion.tsx — la franja que avisa antes de echar a nadie
// ----------------------------------------------------------------------------
// AQUÍ NO SE DECIDE NADA. La aritmética entera vive en `datos/relojSesion.ts`,
// que es puro y se prueba sin navegador; este componente mira el reloj de pared,
// pregunta qué toca y pinta. Es la misma separación que ya tiene la puerta de
// acceso, y por el mismo motivo: la única pantalla capaz de echar a una persona
// de su herramienta no puede ser la única que no se puede probar.
//
// LO QUE SÍ VIVE AQUÍ, porque es del navegador y de ningún otro sitio:
//   · qué cuenta como ACTIVIDAD (puntero, teclado, volver a la pestaña);
//   · cada cuánto se mira el reloj;
//   · y el aviso de un minuto antes, que es lo que convierte un corte en algo
//     que se puede prever en vez de una pérdida de trabajo.
//
// ⚠️ EL AVISO NO SE PUEDE POSPONER PARA SIEMPRE. «Sigo aquí» reinicia el reloj
// de INACTIVIDAD y solo ése: el absoluto no se estira, y por eso el botón no
// aparece cuando el que va a cortar es el absoluto. Un botón que promete algo
// que no va a pasar es peor que no tener botón.
// ============================================================================
import { useEffect, useRef, useState } from 'react';
import { almacen, useSesion } from '../datos/enlace';
import { cuantoQueda, motivoEnPalabras, relojDeSesion, type EstadoReloj } from '../datos/relojSesion';

/** Cada cuánto se mira el reloj de pared. Un segundo solo cuando ya se avisa. */
const CADA_MS = 5_000;
const CADA_MS_AVISANDO = 1_000;

export function RelojDeSesion() {
  const sesion = useSesion();
  const autenticado = sesion.fase === 'autenticado';
  const rol = autenticado ? sesion.rol : null;
  const autenticadoEn = autenticado ? sesion.autenticadoEn : null;

  /**
   * La última vez que esta persona TOCÓ algo. En una referencia y no en estado:
   * cambia con cada movimiento y no tiene que repintar nada.
   */
  const ultimaActividad = useRef<number>(Date.now());
  const [estado, setEstado] = useState<EstadoReloj | null>(null);
  /** Que el cierre no se dispare dos veces si dos ticks se solapan. */
  const cerrando = useRef(false);

  // ── Qué cuenta como actividad ─────────────────────────────────────────────
  useEffect(() => {
    if (!autenticado) return;
    const tocar = () => { ultimaActividad.current = Date.now(); };
    // `pointerdown` y no `mousemove`: un ratón que se mueve solo porque el
    // escritorio tiembla no es una persona trabajando. `keydown` cubre a quien
    // escribe sin tocar el ratón, que en esta herramienta es la mitad del uso.
    const alVolver = () => { if (document.visibilityState === 'visible') tocar(); };
    addEventListener('pointerdown', tocar, { passive: true });
    addEventListener('keydown', tocar, { passive: true });
    addEventListener('wheel', tocar, { passive: true });
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      removeEventListener('pointerdown', tocar);
      removeEventListener('keydown', tocar);
      removeEventListener('wheel', tocar);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [autenticado]);

  // Al empezar una sesión nueva, el contador de inactividad empieza de cero.
  useEffect(() => {
    ultimaActividad.current = Date.now();
    cerrando.current = false;
    setEstado(null);
  }, [autenticado, autenticadoEn]);

  // ── El tic ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!autenticado) return;

    let temporizador: ReturnType<typeof setTimeout>;

    const mirar = () => {
      const r = relojDeSesion({
        rol,
        autenticadoEn,
        ultimaActividad: ultimaActividad.current,
        // El reloj de PARED, no un contador acumulado: si el portátil se
        // suspende tres horas, al despertar tiene que haber caducado. Un
        // contador que solo avanza mientras la pestaña vive no caduca nunca.
        ahora: Date.now(),
      });
      setEstado(r);

      if (r.fase === 'caducada' && !cerrando.current) {
        cerrando.current = true;
        void almacen.cerrarSesionPorReloj(motivoEnPalabras(r.motivo));
        return;
      }
      if (r.fase === 'sin_corte') return;   // este rol no caduca: nada que vigilar
      temporizador = setTimeout(mirar, r.fase === 'avisando' ? CADA_MS_AVISANDO : CADA_MS);
    };

    mirar();
    return () => clearTimeout(temporizador);
  }, [autenticado, rol, autenticadoEn]);

  if (!autenticado || !estado || estado.fase !== 'avisando') return null;

  const seguir = () => {
    ultimaActividad.current = Date.now();
    setEstado(null);
  };

  return (
    <div className="franja-sesion" role="alert">
      <span>
        <b>Su sesión está a punto de cerrarse</b> — {cuantoQueda(estado.quedanMs)}.{' '}
        {estado.motivo === 'inactividad'
          ? 'Lleva un rato sin tocar nada.'
          : 'Es la duración máxima prevista para su permiso, y no se puede alargar: guarde lo que tenga a medias.'}
      </span>
      {estado.motivo === 'inactividad' && (
        <button type="button" className="boton chico" onClick={seguir}>Sigo aquí</button>
      )}
    </div>
  );
}
