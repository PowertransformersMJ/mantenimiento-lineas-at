// ============================================================================
// datos/relojSesion.ts — cuánto dura una sesión, en aritmética pura
// ----------------------------------------------------------------------------
// SIN DOM, SIN TEMPORIZADORES, SIN REACT. Aquí solo se resta. El componente que
// lo usa mira el reloj de pared y le pregunta a esto qué toca; así la regla se
// puede probar con `node --test` sin abrir un navegador.
//
// POR QUÉ ESTO NO ES UN NÚMERO DENTRO DE UN COMPONENTE: porque uno de los tres
// CRM que se escanearon PERDIÓ su corte de 30 minutos en una migración y nadie
// lo notó en meses (`contratos/src/usuarios.ts`). Un corte de sesión que solo
// existe dentro de un `useEffect` es un corte que desaparece el día que alguien
// reescriba la pantalla, y nadie se entera porque no falla nada: sencillamente
// las sesiones dejan de caducar.
//
// LOS DOS RELOJES SON DISTINTOS A PROPÓSITO:
//   · ABSOLUTO — corta aunque se esté usando. Cuenta desde que Firebase abrió la
//     sesión, no desde que se cargó la página: si contara desde la carga,
//     recargar la pestaña la renovaría para siempre.
//   · INACTIVIDAD — corta tras ese tiempo sin tocar nada, con aviso un minuto
//     antes. La cuadrilla en campo NO lo tiene (`null` en el catálogo): un
//     teléfono en el bolsillo entre apoyo y apoyo no puede echar a nadie.
// ============================================================================
import { DURACION_SESION_MIN, type Rol } from '@lineas/contratos';

/** Cuánto antes del corte se avisa. Un minuto: lo justo para guardar. */
export const AVISO_MIN = 1;

const MS = 60_000;

export type MotivoDeCorte = 'absoluto' | 'inactividad';

export interface EstadoReloj {
  /**
   * `sin_corte` — este rol no caduca por ningún reloj.
   * `corriendo` — queda tiempo de sobra.
   * `avisando`  — queda un minuto o menos: hay que decirlo en pantalla.
   * `caducada`  — se acabó; toca cerrar sesión.
   */
  fase: 'sin_corte' | 'corriendo' | 'avisando' | 'caducada';
  /** Milisegundos que quedan, o `null` si no hay corte. Nunca negativo. */
  quedanMs: number | null;
  /** Cuál de los dos relojes va a cortar primero. */
  motivo: MotivoDeCorte | null;
  /**
   * El reloj ABSOLUTO no se pudo aplicar porque no consta cuándo empezó la
   * sesión. Se declara en vez de fingir que se cumple: una caducidad que no se
   * puede calcular no es una caducidad de cero, pero tampoco es una de infinito
   * que nadie declaró.
   */
  absolutoNoAplicado: boolean;
}

/**
 * Los dos topes de un rol. Un rol que no está en el catálogo —o una sesión sin
 * rol legible— recibe **el más corto de todos**, no el más largo: es la misma
 * regla que el resto de esta ola, mínimo privilegio ante la duda.
 */
export function topesDeRol(rol: string | null | undefined): { absoluto: number | null; inactividad: number | null } {
  const conocido = DURACION_SESION_MIN[rol as Rol];
  if (conocido) return conocido;

  const todos = Object.values(DURACION_SESION_MIN);
  const menor = (xs: (number | null)[]) => {
    const n = xs.filter((x): x is number => typeof x === 'number');
    return n.length ? Math.min(...n) : null;
  };
  return {
    absoluto: menor(todos.map((t) => t.absoluto)),
    inactividad: menor(todos.map((t) => t.inactividad)),
  };
}

/**
 * Qué toca hacer con esta sesión, ahora mismo.
 *
 * `autenticadoEn` es la hora en que Firebase abrió la sesión (`authTime` del
 * token). Si no consta, el reloj absoluto NO se inventa: se declara no aplicado
 * y manda el de inactividad.
 */
export function relojDeSesion(e: {
  rol: string | null | undefined;
  autenticadoEn: number | null;
  ultimaActividad: number;
  ahora: number;
}): EstadoReloj {
  const topes = topesDeRol(e.rol);

  const finales: { fin: number; motivo: MotivoDeCorte }[] = [];
  if (topes.absoluto !== null && e.autenticadoEn !== null) {
    finales.push({ fin: e.autenticadoEn + topes.absoluto * MS, motivo: 'absoluto' });
  }
  if (topes.inactividad !== null) {
    finales.push({ fin: e.ultimaActividad + topes.inactividad * MS, motivo: 'inactividad' });
  }

  const absolutoNoAplicado = topes.absoluto !== null && e.autenticadoEn === null;

  if (!finales.length) {
    return { fase: 'sin_corte', quedanMs: null, motivo: null, absolutoNoAplicado };
  }

  // Manda el que corte antes: los dos relojes son topes, no alternativas.
  const primero = finales.reduce((a, b) => (a.fin <= b.fin ? a : b));
  const quedan = primero.fin - e.ahora;

  if (quedan <= 0) {
    return { fase: 'caducada', quedanMs: 0, motivo: primero.motivo, absolutoNoAplicado };
  }
  return {
    fase: quedan <= AVISO_MIN * MS ? 'avisando' : 'corriendo',
    quedanMs: quedan,
    motivo: primero.motivo,
    absolutoNoAplicado,
  };
}

/** Lo que se le dice a la persona cuando el reloj la echa. Sin jerga. */
export function motivoEnPalabras(motivo: MotivoDeCorte | null): string {
  if (motivo === 'inactividad') {
    return 'Su sesión se cerró por inactividad. No se ha perdido nada de lo que ya estaba guardado: '
      + 'vuelva a entrar y siga donde estaba.';
  }
  if (motivo === 'absoluto') {
    return 'Su sesión alcanzó su duración máxima y se cerró. Es lo previsto para su permiso, no una '
      + 'avería: vuelva a entrar.';
  }
  return 'Su sesión se cerró.';
}

/** «queda 1 minuto» / «quedan 45 segundos», para la franja de aviso. */
export function cuantoQueda(ms: number | null): string {
  if (ms === null || ms <= 0) return 'se acabó';
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `quedan ${s} segundo${s === 1 ? '' : 's'}`;
  const m = Math.ceil(s / 60);
  return `queda${m === 1 ? '' : 'n'} ${m} minuto${m === 1 ? '' : 's'}`;
}
