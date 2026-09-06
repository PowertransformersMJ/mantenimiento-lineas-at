// ============================================================================
// acceso.ts — la puerta: quién pasa directo y a quién se le exige cambiar
// ----------------------------------------------------------------------------
// POR QUÉ ESTO ES UNA FUNCIÓN PURA Y NO UN `if` EN UN COMPONENTE. Es la única
// pantalla del sistema que se INTERPONE antes de entrar. Si se equivoca, no
// muestra un dato raro: **deja a una persona fuera de su propia herramienta**.
// Una decisión así se prueba sin navegador o no se prueba.
//
// ⚠️ LO QUE ESTA PANTALLA **NO** ES: una frontera de seguridad. El recibo lo
// escribe el propio navegador, así que cualquiera con la consola abierta puede
// escribirlo sin haber cambiado nada — y el daño se lo hace a su propia cuenta.
// Impedirlo exigiría un servidor, que este proyecto no tiene por la regla de
// coste cero. Se acepta y se dice.
//
// **Esta pantalla es HIGIENE.** La frontera son las reglas de la base y el rol.
// Escribir lo contrario sería repetir exactamente la frase que se retiró el
// 2026-08-05, cuando un comentario afirmaba que la aplicación obligaba a cambiar
// la contraseña provisional y no la leía nadie.
//
// EL MECANISMO ES DE DOS PIEZAS, y ésa es la razón de que exista este archivo:
//   · LA ORDEN la escribe el administrador en los reclamos del token.
//   · EL RECIBO lo escribe la propia persona en la base, después de cambiarla.
// Con una sola pieza —solo la orden— la pantalla sería **una puerta que se
// cierra por dentro**: la persona cambia su contraseña, vuelve, y la misma
// pantalla la recibe, porque la marca del token solo la apaga el administrador
// desde su Mac. Para siempre.
// ============================================================================

export type Puerta = { fase: 'seguir' } | { fase: 'cambiar_contrasena' };

/**
 * CÓMO ESTAMPA FIREBASE EL INGRESO POR CONTRASEÑA en el token (`signInProvider`).
 *
 * Está aquí, en el contrato, y no tecleado en cada sitio: desde que se retiró
 * Google (`§ADR-100`) es el ÚNICO proveedor del sistema, y dos capas lo miran —
 * la puerta de abajo y la cabecera, que solo ofrece «Cambiar mi contraseña» a
 * quien tiene una contraseña que cambiar. Una cadena tecleada dos veces es una
 * cadena que un día se escribe mal en una sola de ellas.
 */
export const PROVEEDOR_CONTRASENA = 'password';

export interface EntradaPuerta {
  /** Cómo entró: `'password'`, `'google.com'`… Lo estampa Firebase en el token. */
  proveedor: string | null;
  /** Los reclamos del token, tal cual. */
  claims: Record<string, unknown> | null;
  /** Cuándo dejó su recibo (milisegundos), o `null` si nunca lo hizo. */
  recibo: number | null;
}

/** Milisegundos de una fecha en cualquiera de las formas en que puede llegar. */
function comoMilisegundos(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v > 1e11 ? v : v * 1000;
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

/**
 * ¿Se le exige cambiar la contraseña antes de entrar?
 *
 * SOLO si se cumplen las TRES a la vez. Cualquier otra cosa, pasa. Y **no lanza
 * jamás**: si algo viene raro, la respuesta es «seguir». Fallar hacia abierto
 * aquí es deliberado — esta pantalla es higiene, y una capa opcional nunca tiene
 * veto sobre una esencial (`31 · L-11`).
 *
 * 1. ENTRÓ CON CONTRASEÑA. Quien entra por Google no tiene contraseña que
 *    cambiar; exigírsela lo dejaría encerrado. Es el cerrojo fuerte porque **no
 *    lo aprovisiona nadie**: lo estampa Firebase, no depende de que una marca
 *    esté bien puesta.
 * 2. LA MARCA VALE VERDADERO, ESTRICTO. `=== true`, no «es verdadero-ish»: un
 *    reclamo ausente o con basura NO encierra a nadie.
 * 3. NO HAY RECIBO POSTERIOR A LA ORDEN. Si ya cambió su contraseña después de
 *    que se le ordenara, no se le vuelve a pedir.
 *
 * POR QUÉ LA ORDEN LLEVA FECHA. Reponer una contraseña desde la pantalla de personas puede reponer una
 * contraseña provisional una SEGUNDA vez. Con un recibo de sí/no, esa segunda
 * contraseña no se exigiría cambiar nunca — el recibo viejo la taparía. Con
 * fechas, una orden nueva es más reciente que el recibo y la pantalla vuelve
 * sola. Si la orden no trae fecha (cuentas creadas antes del 06-08-2026),
 * cualquier recibo la satisface: es lo que había, y no se rompe hacia atrás.
 */
export function puertaDeAcceso(e: EntradaPuerta): Puerta {
  try {
    const seguir: Puerta = { fase: 'seguir' };

    // 1 · Cerrojo fuerte: quien no entró con contraseña, no tiene qué cambiar.
    if (e?.proveedor !== PROVEEDOR_CONTRASENA) return seguir;

    // 2 · La marca, estricta.
    const c = e?.claims;
    if (!c || c.passwordProvisional !== true) return seguir;

    // 3 · El recibo, contra la fecha de la orden si la hay.
    const ordenadaEn = comoMilisegundos(c.contrasenaOrdenadaEn);
    const recibo = typeof e.recibo === 'number' && Number.isFinite(e.recibo) ? e.recibo : null;

    if (recibo === null) return { fase: 'cambiar_contrasena' };
    if (ordenadaEn === null) return seguir;          // orden sin fecha: basta un recibo
    return recibo >= ordenadaEn ? seguir : { fase: 'cambiar_contrasena' };
  } catch {
    // Nunca encerrar a nadie por un error de lectura.
    return { fase: 'seguir' };
  }
}

// ── LA REGLA DE LA CONTRASEÑA, EN UN SOLO SITIO ─────────────────────────────

/**
 * El mínimo, aquí y en ninguna otra parte.
 *
 * ⚠️ Firebase acepta contraseñas de 6 caracteres. El trabajador de personas
 * exige 12. Si la pantalla de cambio se apoyara en el mínimo de Firebase, el
 * sistema gastaría una pantalla OBLIGATORIA en **debilitar** la contraseña: la
 * persona entraría con una de 12 puesta por el administrador y saldría con una
 * de 6. Una sola definición, dos consumidores.
 */
export const MIN_CONTRASENA = 12;

/**
 * Qué le falta a una contraseña, en palabras. Lista vacía = sirve.
 *
 * Los tres rechazos no son un capricho: son las tres formas en que una
 * contraseña provisional se filtra de verdad — corta, adivinable, o igual al
 * correo de la persona.
 */
export function defectosDeContrasena(contrasena: string, correo: string): string[] {
  const c = String(contrasena ?? '');
  const fallos: string[] = [];

  if (c.length < MIN_CONTRASENA) {
    fallos.push(`tiene ${c.length} caracteres y el mínimo son ${MIN_CONTRASENA}`);
  }
  if (!/[a-zá-ú]/i.test(c) || !/\d/.test(c)) {
    fallos.push('debe mezclar letras y números');
  }
  const usuario = String(correo ?? '').split('@')[0].toLowerCase();
  if (usuario.length > 2 && c.toLowerCase().includes(usuario)) {
    fallos.push('contiene su propio correo');
  }
  if (c.length > 0 && /^(.)\1+$/.test(c)) {
    fallos.push('es un solo carácter repetido');
  }
  return fallos;
}

// ── EL ORDEN DE LAS TRES OPERACIONES, QUE ES UN INVARIANTE ──────────────────

export type ResultadoCambio =
  | { fase: 'entrar' }
  /** La contraseña SÍ cambió, pero el recibo no se pudo escribir. */
  | { fase: 'entrar_sin_recibo' }
  | { fase: 'fallo'; codigo: string };

/**
 * Cambia la contraseña en el orden correcto, y el orden es lo importante.
 *
 * SE REAUTENTICA SIEMPRE, no solo cuando Firebase se queja. Dos razones:
 *   · rompe de raíz el bucle clásico de esta pantalla —«vuelva a entrar» → entra
 *     → «vuelva a entrar»— que aparece cuando `updatePassword` responde
 *     `requires-recent-login` y se maneja reaccionando;
 *   · y cierra el agujero de que baste un portátil abierto para apoderarse de
 *     una cuenta.
 *
 * ⚠️ EL RECIBO SE ESCRIBE DESPUÉS, Y SOLO SI EL CAMBIO SALIÓ BIEN. Al revés se
 * marcaría como hecho algo que no ocurrió: una contraseña provisional viviendo
 * indefinidamente mientras la auditoría dice que ya se cambió. Es el único fallo
 * de este diseño con daño de verdad, y por eso el orden está aquí y no en un
 * componente.
 *
 * Si el recibo falla pero la contraseña sí cambió, **se entra igual** y se
 * devuelve `entrar_sin_recibo`: la persona ya tiene su contraseña nueva, y
 * negarle la entrada por no haber podido escribir una fecha sería castigarla por
 * un fallo del sistema. La pantalla volverá a aparecer la próxima vez, que es
 * molesto y no destructivo.
 */
export async function cambiarContrasena(pasos: {
  reautenticar: () => Promise<void>;
  actualizar: () => Promise<void>;
  dejarRecibo: () => Promise<void>;
}): Promise<ResultadoCambio> {
  try {
    await pasos.reautenticar();
  } catch (e) {
    return { fase: 'fallo', codigo: codigoDe(e) };
  }

  try {
    await pasos.actualizar();
  } catch (e) {
    return { fase: 'fallo', codigo: codigoDe(e) };
  }

  try {
    await pasos.dejarRecibo();
  } catch {
    return { fase: 'entrar_sin_recibo' };
  }
  return { fase: 'entrar' };
}

function codigoDe(e: unknown): string {
  const c = (e as { code?: unknown })?.code;
  return typeof c === 'string' ? c : 'desconocido';
}

/** Qué decirle a la persona por cada fallo, sin jerga y sin código de error. */
export function motivoDelFallo(codigo: string): string {
  switch (codigo) {
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'La contraseña actual no es correcta.';
    case 'auth/weak-password':
      return `La contraseña nueva es demasiado débil: al menos ${MIN_CONTRASENA} caracteres, con letras y números.`;
    case 'auth/too-many-requests':
      return 'Demasiados intentos seguidos. Espere unos minutos y vuelva a probar.';
    case 'auth/network-request-failed':
      return 'No hay conexión con el servidor. Su contraseña NO se cambió.';
    case 'auth/requires-recent-login':
      return 'Por seguridad hay que volver a iniciar sesión. Salga y entre de nuevo.';
    default:
      return 'No se pudo cambiar la contraseña. Su contraseña anterior sigue siendo válida.';
  }
}
