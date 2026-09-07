// ============================================================================
// datos/usuariosRemoto.ts — hablar con el trabajador de personas
// ----------------------------------------------------------------------------
// LA PANTALLA NO CREA CUENTAS. No puede: acuñar un reclamo en un token exige la
// llave maestra de Firebase, y esa llave no toca jamás el navegador. Todo lo que
// hay aquí es un mensajero — lleva la petición con el token de quien la hace y
// trae de vuelta lo que el trabajador decidió.
//
// LA DIRECCIÓN LLEGA IGUAL QUE LA DEL PORTERO DE FOTOS: por `import.meta.env`,
// horneada en el paquete desde `.env.production`. Y por el mismo argumento que
// aquel archivo escribe entero: **la dirección no es un secreto**. La seguridad
// no viene de esconderla, viene de que el trabajador verifica la FIRMA del token
// contra las llaves públicas de Google antes de hacer nada, y de que rechaza a
// quien no traiga `usuarios.gestionar` (ADR-010, mismo patrón).
//
// SIN DIRECCIÓN CONFIGURADA NO SE INTENTA NADA y la pantalla lo dice. Es el
// mismo fallo-cerrado que el portero: una configuración incompleta APAGA, no
// abre (`tests/portero.test.js`, hallazgo de la ola 4).
//
// ⚠️ EL ACTOR DE CADA BITÁCORA SALE DEL TOKEN, no de aquí. Este cliente NUNCA
// manda quién es: manda su token y que el trabajador lo verifique. Un registro
// de auditoría que el auditado puede firmar con el nombre de otro no es un
// registro de auditoría.
// ============================================================================
import type { Funcion, ModoDeAlta, Rol } from '@lineas/contratos';

/** Base del trabajador de personas. Sin ella, esta pantalla no intenta nada. */
export const TRABAJADOR = import.meta.env.VITE_USUARIOS_URL as string | undefined;

export function hayTrabajador(): boolean {
  return typeof TRABAJADOR === 'string' && TRABAJADOR.trim().length > 0;
}

/**
 * Una persona tal y como la pantalla la lista. Es el PERFIL de la base más el
 * identificador y lo que solo sabe el servidor de autenticación (si la cuenta
 * está deshabilitada de verdad, y si arrastra contraseña provisional).
 *
 * `funcionesEfectivas` lo calcula el trabajador con la MISMA función del
 * catálogo que usa la pantalla. Viaja calculado para que la tabla no tenga que
 * recalcular 40 veces lo mismo, y la pantalla lo compara con lo que ella misma
 * derivaría: si divergen, el catálogo y el trabajador ya no dicen lo mismo.
 */
export interface PersonaListada {
  uid: string;
  correo: string;
  nombre: string;
  rol: Rol;
  funcionesExtra: Funcion[];
  funcionesQuitadas: Funcion[];
  funcionesEfectivas: Funcion[];
  lineas: string[];
  activo: boolean;
  ultimoAcceso?: string | null;
  contrasenaProvisionalPendiente?: boolean;
  /** El perfil de la base y el token no dicen lo mismo: hay que reconciliar. */
  desincronizado?: boolean;
  /**
   * CON QUÉ ENTRA cada quien (`password`, `google.com`…). Lo trae el trabajador
   * y no es un adorno: es lo único que dice quién sigue dependiendo de un
   * proveedor federado.
   *
   * Nació para poder retirar «Entrar con Google» sin dejar a nadie fuera de su
   * propia herramienta. Ese botón ya no existe (`99 §ADR-100`), y el campo se
   * queda porque el trabajo cambió de sitio, no desapareció: es como se
   * COMPRUEBA —sin suponerlo— que tras la limpieza inicial no queda ninguna
   * cuenta entrando por otra puerta.
   */
  proveedores?: string[];
  /** Qué le pasa al espejo del perfil: `ok`, `falta`, `divergente`, `desconocido`. */
  espejo?: string;
}

/**
 * UNA CUENTA QUE EXISTE Y NO ES DE NADIE: sin organización y sin rol.
 *
 * El trabajador las devuelve APARTE y **no las esconde**, porque verlas es justo
 * el trabajo: así aparecería hoy la cuenta ajena que se dio de alta sola por
 * «Entrar con Google» el 31-07-2026. Una pantalla de administración que solo
 * enseña a las personas bien aprovisionadas es la que hace que nadie se entere.
 */
export interface CuentaSinAprovisionar {
  uid: string;
  correo: string;
  nombre: string;
  activo: boolean;
  proveedores?: string[];
  ultimoAcceso?: string | null;
  creadaEn?: string | null;
}

/** Todo lo que contesta el trabajador al listar, no solo la tabla. */
export interface ListadoDePersonas {
  usuarios: PersonaListada[];
  /** Cuentas que existen en el servidor de acceso y no son de nadie. */
  sinAprovisionar: CuentaSinAprovisionar[];
  /**
   * QUÉ ROLES PUEDE ASIGNAR QUIEN PREGUNTA. Lo decide el trabajador —nombrar
   * administradores es del propietario— y la pantalla lo obedece: ofrecer un rol
   * que el servidor va a rechazar es exactamente el botón mentiroso que este
   * sistema tiene prohibido.
   */
  puedeAsignar: Rol[];
  /**
   * Si el espejo de la base se pudo leer. Con `false`, «sin reconciliar» no
   * significa nada y la pantalla tiene que decir que NO SE SABE, en vez de
   * pintar veinte cuentas sanas como si estuvieran bien.
   */
  espejoLegible: boolean;
}

export interface AltaDePersona {
  nombre: string;
  correo: string;
  rol: Rol;
  funcionesExtra: Funcion[];
  funcionesQuitadas: Funcion[];
  /** `['*']` o los identificadores de línea. Nunca vacío. */
  lineas: string[];
  modo: ModoDeAlta;
  /** Solo con `modo: 'contrasena'`. Viaja por TLS. */
  contrasena?: string;
  /**
   * ¿Se le exige cambiarla en el primer acceso? Ausente = SÍ.
   *
   * El muro existe por no repudio: mientras dos conozcan la contraseña, lo que
   * esa persona firme no es solo suyo. Ese argumento se apaga en una cuenta que
   * no escribe nada, y ahí exigirlo es ceremonia. Renunciar es explícito y
   * queda en la bitácora (`99 §ADR-104`).
   */
  exigirCambio?: boolean;
}

export interface CambioDePersona {
  nombre?: string;
  rol?: Rol;
  funcionesExtra?: Funcion[];
  funcionesQuitadas?: Funcion[];
  lineas?: string[];
}

/**
 * Lo que devuelve un alta o una reposición de credencial.
 *
 * ⚠️ `enlace` SE VE UNA VEZ Y NO SE GUARDA EN NINGÚN SITIO. No entra en el
 * estado persistente, no se escribe en `localStorage`, no viaja al almacén: vive
 * en el estado local del formulario y muere con él. Un enlace de un solo uso
 * guardado «por comodidad» es una credencial en claro esperando a que alguien
 * abra las herramientas del navegador.
 */
export interface ResultadoDeCredencial {
  uid?: string;
  enlace?: string;
  /**
   * CUÁNDO CADUCA EL ENLACE, en fecha completa, si el trabajador lo sabe.
   *
   * Hoy **no lo manda** (comprobado en `usuarios/src/index.js`: la respuesta del
   * alta y la de la reposición llevan `enlace` y nada más), y por eso llega
   * `undefined` y la pantalla enseña el plazo POR DEFECTO diciendo que es el
   * defecto. Se declara igualmente porque el plazo real se sube a mano en la
   * consola (Authentication → Templates → «Expire after») y el navegador no
   * tiene forma de averiguarlo: el día que el trabajador lo devuelva, la
   * pantalla dirá la hora exacta sin tocar nada más. Lo que NO se hace es
   * calcularla aquí sumando una hora — sería un dato inventado presentado como
   * medido, que es la clase de mentira que hace tirar un enlace que servía.
   */
  caducidad?: string;
}

// ── El mensajero ────────────────────────────────────────────────────────────

/**
 * Traduce lo que respondió el trabajador a algo que una persona entienda.
 *
 * ⚠️ NUNCA se distingue «esa cuenta no existe» de «esa contraseña no es»: eso
 * convertiría esta pantalla en un buscador de correos dados de alta. Es la misma
 * unificación que Firebase hace a propósito y que `motivoDeFallo` respeta.
 *
 * Y nunca se enseña el código técnico: un número HTTP no le dice nada a nadie y
 * ocupa el sitio de la frase que sí sirve.
 */
function motivoHumano(estado: number, delServidor?: string): string {
  if (estado === 401) return 'Su sesión caducó. Vuelva a entrar y repita la operación.';
  if (estado === 403) return delServidor || 'Su cuenta no tiene permiso para administrar personas.';
  if (estado === 404) return 'Esa operación no existe en el servicio de personas. Avise: hay dos versiones distintas desplegadas.';
  if (estado === 409) return delServidor || 'Ya existe una cuenta con ese correo.';
  if (estado === 422 || estado === 400) return delServidor || 'Los datos del formulario no son válidos.';
  if (estado === 429) return 'Demasiadas operaciones seguidas. Espere un minuto y vuelva a probar.';
  if (estado === 503) return 'El servicio de personas no está configurado. No se ha cambiado nada.';
  return delServidor || 'No se pudo completar la operación. No se ha cambiado nada.';
}

/** El error que esta capa lanza. Siempre con frase, nunca con código. */
export class FalloDePersonas extends Error {
  readonly estado: number;
  constructor(estado: number, mensaje: string) {
    super(mensaje);
    this.name = 'FalloDePersonas';
    this.estado = estado;
  }
}

async function pedir<T>(ruta: string, opciones: { metodo?: string; cuerpo?: unknown } = {}): Promise<T> {
  return pedirConCabeceras<T>(ruta, opciones);
}

async function pedirConCabeceras<T>(
  ruta: string, opciones: { metodo?: string; cuerpo?: unknown; cabeceras?: Record<string, string> } = {},
): Promise<T> {
  if (!hayTrabajador()) {
    throw new FalloDePersonas(503,
      'El servicio de personas no está configurado en este despliegue (falta VITE_USUARIOS_URL). '
      + 'No se ha intentado nada.');
  }

  // El token SIEMPRE fresco: es lo único que identifica a quien pide, y quien
  // pide puede llevar la pantalla abierta desde hace una hora.
  const { cargarFirebase } = await import('./cargar');
  const { esperarSesion } = await cargarFirebase();
  const u = await esperarSesion();
  if (!u) throw new FalloDePersonas(401, 'No hay ninguna sesión abierta. Vuelva a entrar.');
  const token = await u.getIdToken();

  let r: Response;
  try {
    r = await fetch(`${String(TRABAJADOR).replace(/\/+$/, '')}${ruta}`, {
      method: opciones.metodo ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(opciones.cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(opciones.cabeceras ?? {}),
      },
      body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
    });
  } catch {
    // Una red caída no es un permiso denegado, y decirlo mal manda a revisar la
    // cuenta de alguien que solo se quedó sin señal.
    throw new FalloDePersonas(0, 'No hubo conexión con el servicio de personas. No se ha cambiado nada.');
  }

  const texto = await r.text();
  let cuerpo: unknown = null;
  try { cuerpo = texto ? JSON.parse(texto) : null; } catch { cuerpo = null; }

  if (!r.ok) {
    const delServidor = (cuerpo as { error?: string } | null)?.error;
    throw new FalloDePersonas(r.status, motivoHumano(r.status, delServidor));
  }
  return (cuerpo ?? {}) as T;
}

// ── Las operaciones, una por gesto de la pantalla ───────────────────────────

/**
 * Quiénes hay. El trabajador filtra por la organización del token.
 *
 * Devuelve TODO lo que contesta, no solo la tabla: los tres campos de alrededor
 * —qué roles puede asignar quien pregunta, qué cuentas están sin aprovisionar y
 * si el espejo se pudo leer— existen precisamente para que la pantalla no
 * afirme cosas que el servidor no sostiene.
 */
export async function listarPersonas(): Promise<ListadoDePersonas> {
  const r = await pedir<Partial<ListadoDePersonas>>('/usuarios');
  return {
    usuarios: Array.isArray(r.usuarios) ? r.usuarios : [],
    sinAprovisionar: Array.isArray(r.sinAprovisionar) ? r.sinAprovisionar : [],
    // Sin respuesta del trabajador NO se inventa una lista de roles: se deja
    // vacía y la pantalla usa la del catálogo, que es la cota superior.
    puedeAsignar: Array.isArray(r.puedeAsignar) ? r.puedeAsignar : [],
    // Ante la duda, el espejo NO se declara legible: es la respuesta que hace
    // que la pantalla diga «no se sabe» en vez de «está bien».
    espejoLegible: r.espejoLegible === true,
  };
}

/** Alta. Con `modo: 'enlace'` devuelve el enlace de un solo uso, UNA vez. */
export async function crearPersona(datos: AltaDePersona): Promise<ResultadoDeCredencial> {
  return await pedir<ResultadoDeCredencial>('/usuarios', { metodo: 'POST', cuerpo: datos });
}

/** Cambia rol, funciones, alcance o nombre. Solo lo que se manda. */
export async function editarPersona(uid: string, cambio: CambioDePersona): Promise<void> {
  await pedir<unknown>(`/usuarios/${encodeURIComponent(uid)}`, { metodo: 'PATCH', cuerpo: cambio });
}

/**
 * Deshabilita o restituye.
 *
 * NO borra: un usuario borrado se lleva por delante la trazabilidad de todo lo
 * que declaró, y este sistema guarda quién declaró cada dato de un apoyo que
 * después se firma. Deshabilitar deja el rastro y cierra la puerta.
 */
export async function cambiarEstado(uid: string, activo: boolean): Promise<void> {
  await pedir<unknown>(`/usuarios/${encodeURIComponent(uid)}/estado`, { metodo: 'POST', cuerpo: { activo } });
}

/** Repone credencial: enlace de un solo uso, o contraseña tecleada por el admin. */
export async function reponerCredencial(
  uid: string, datos: { modo: ModoDeAlta; contrasena?: string; exigirCambio?: boolean },
): Promise<ResultadoDeCredencial> {
  return await pedir<ResultadoDeCredencial>(
    `/usuarios/${encodeURIComponent(uid)}/contrasena`, { metodo: 'POST', cuerpo: datos },
  );
}

/**
 * Rehace el token desde el perfil, o el perfil desde el token.
 *
 * Existe porque escribir el reclamo y escribir el espejo NO son una transacción:
 * pueden divergir. El catálogo ya declara la dirección de la reparación —el
 * token manda—; aquí solo se pide.
 */
export async function reconciliar(uid: string): Promise<void> {
  await pedir<unknown>(`/usuarios/${encodeURIComponent(uid)}/reconciliar`, { metodo: 'POST' });
}

// ── El arranque y la limpieza inicial (`99 §ADR-100`) ───────────────────────

/** Lo que el trabajador dice de sí mismo SIN sesión: no revela uid ni correo. */
export interface EstadoDelSistema {
  configurado: boolean;
  arrancado: boolean | null;
  limpiezaHecha: boolean | null;
}

/**
 * GET /estado va SIN token: sirve para saber si hay algo que arrancar antes de
 * que exista sesión con permisos. No pasa por `pedir` porque `pedir` exige
 * sesión y token, y esto se consulta precisamente cuando la sesión aún no vale.
 */
export async function estadoDelSistema(): Promise<EstadoDelSistema | null> {
  if (!hayTrabajador()) return null;
  try {
    const r = await fetch(`${String(TRABAJADOR).replace(/\/+$/, '')}/estado`);
    const c = (await r.json()) as Partial<EstadoDelSistema>;
    return {
      configurado: c.configurado === true,
      arrancado: typeof c.arrancado === 'boolean' ? c.arrancado : null,
      limpiezaHecha: typeof c.limpiezaHecha === 'boolean' ? c.limpiezaHecha : null,
    };
  } catch {
    return null;
  }
}

export interface ResultadoDeArranque {
  reparado: boolean;
  reclamos: { orgId: string; rol: string; f: string[]; l: string[] };
}

/**
 * POST /bootstrap: la cuenta creada en la consola se convierte en propietario.
 * Todo lo que decide está en el trabajador (uid configurado, contraseña,
 * sesión reciente, cerrojo de un solo uso). Aquí solo se pide.
 */
export async function arrancarSistema(): Promise<ResultadoDeArranque> {
  return await pedir<ResultadoDeArranque>('/bootstrap', { metodo: 'POST', cuerpo: {} });
}

export interface EnsayoDeLimpieza {
  total: number;
  uids: string[];
  orgId: string;
  cuentas: { uid: string; correo: string; proveedores: string[]; deshabilitada: boolean; rol: string; creadaEn: string | null }[];
  aviso?: string;
}

/** GET /limpieza-inicial?simular=1 — la lista de lo que se borraría. No borra. */
export async function ensayarLimpieza(): Promise<EnsayoDeLimpieza> {
  return await pedir<EnsayoDeLimpieza>('/limpieza-inicial?simular=1');
}

export interface ResultadoDeLimpieza {
  borradas: string[];
  noBorradas: { localId: string; message: string }[];
  hechos: number;
  pendientes: number;
  terminado: boolean;
}

/**
 * POST /limpieza-inicial. El secreto de un solo uso viaja en una cabecera y
 * **no se guarda en ningún sitio**: vive en el estado del formulario y muere
 * con él. El cuerpo tiene que ser EXACTAMENTE el del ensayo.
 */
export async function ejecutarLimpieza(
  secreto: string, ensayo: { total: number; uids: string[]; orgId: string },
): Promise<ResultadoDeLimpieza> {
  return await pedirConCabeceras<ResultadoDeLimpieza>('/limpieza-inicial', {
    metodo: 'POST', cabeceras: { 'X-Limpieza-Token': secreto },
    cuerpo: { ...ensayo, confirmacion: 'BORRAR' },
  });
}
