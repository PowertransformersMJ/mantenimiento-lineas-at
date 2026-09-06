// ============================================================================
// usuarios.ts — QUIÉN PUEDE HACER QUÉ: roles, funciones y responsabilidades
// ----------------------------------------------------------------------------
// EL ÚNICO SITIO DONDE SE DEFINE EL PERMISO. Lo consumen tres capas que NO se
// pueden contradecir entre sí: `firestore.rules` (la frontera), el trabajador
// `usuarios/` (el único que escribe reclamos) y la pantalla (que solo DIBUJA).
// Hay una prueba de paridad que recorre las tres y se pone roja si una de ellas
// inventa un código, un rol o una comparación de cadenas por su cuenta.
//
// ⚠️ POR QUÉ ESTO EXISTE, medido en tres sistemas ajenos (`99 §ADR-100`):
//   · Uno tenía el catálogo de roles repartido en TRES archivos que ya habían
//     divergido: un perfil con rol nuevo no se podía editar desde su pantalla.
//   · Otro modelaba `zonas[]`, `contratos[]` y una matriz de 25 permisos que
//     NINGUNA regla consultaba y NINGÚN formulario capturaba: la ilusión de
//     control es peor que su ausencia, porque quien administra se la cree.
//   · El tercero definía un rol en las reglas y en el servidor y lo OLVIDÓ en
//     las tablas del cliente: una cajera creada por consola caía en nivel 0 y
//     el guardia la expulsaba en bucle.
//
// LA REGLA DE LA CASA QUE SALE DE AHÍ: **no existe aquí ningún campo que no se
// haga cumplir en alguna parte.** Si un eje no lo consulta una regla o el
// trabajador, no se modela — y la prueba de paridad lo comprueba.
//
// TRES EJES, y son distintos a propósito:
//   1. ROL — jerárquico. Dice QUIÉN ES la persona. Cinco valores, lista cerrada.
//   2. FUNCIONES — permisos atómicos `<recurso>.<acción>`. Dicen QUÉ PUEDE HACER.
//      Cada rol trae un conjunto por defecto; a una persona se le pueden añadir
//      o quitar funciones DELEGABLES sin cambiarle el rol.
//   3. RESPONSABILIDADES — el ALCANCE: sobre QUÉ LÍNEAS actúa. `['*']` o una
//      lista de identificadores de línea.
//
// TODO VIAJA EN EL TOKEN (`99 §ADR-019 §3`, y el porqué medido está en
// `§ADR-100`): un `get()` dentro de una regla se factura AUNQUE se deniegue, y
// el depósito de fotos no puede leer Firestore. El reclamo arregla las dos
// mitades a la vez. El precio es el tope de 1.000 bytes del token, y por eso
// aquí hay CÓDIGOS CORTOS y un presupuesto que el trabajador mide antes de
// escribir — nunca se trunca en silencio.
// ============================================================================
import { z } from 'zod';
import { Instante, OrgId, Uid } from './comunes.ts';

// ── EJE 1 · EL ROL ──────────────────────────────────────────────────────────

/**
 * Los cinco roles, del mayor al menor. **Lista cerrada.**
 *
 * `propietario` es nuevo (`§ADR-100`) y tiene una sola propiedad que lo
 * distingue: **la aplicación no puede acuñarlo ni tocarlo.** Nace en la CONSOLA
 * de Firebase (correo + contraseña, tecleados por el dueño) y lo reconoce
 * `POST /bootstrap` una sola vez, contra un uid configurado y con cerrojo en la
 * base. Es la cuenta de rescate del dueño del sistema y el techo de la
 * delegación — el patrón «owner/root» que
 * los tres CRM implementaron bien, y del que uno se olvidó y acabó con una
 * puerta trasera (`/admins`) que ni siquiera se podía enumerar desde la app.
 */
export const ROLES = ['propietario', 'admin', 'editor', 'cuadrilla', 'auditor'] as const;
export const Rol = z.enum(ROLES);
export type Rol = z.infer<typeof Rol>;

/** Lo que cada rol ES, en una frase para la pantalla y para la bitácora. */
export const ROL_DESCRIPCION: Record<Rol, string> = {
  propietario: 'dueño del sistema: todo, y el único que puede nombrar administradores',
  admin: 'administra personas, configuración y cargas; edita todo lo técnico',
  editor: 'crea y edita líneas, apoyos, hipótesis y expedientes',
  cuadrilla: 'inspecciona y aporta evidencias en campo; no toca activos ni expedientes',
  auditor: 'lectura completa, bitácoras incluidas; no escribe nada',
};

/**
 * Los roles que la APLICACIÓN puede asignar. `propietario` queda fuera a
 * propósito: el trabajador se niega, y las reglas también.
 */
export const ROLES_ASIGNABLES = ['admin', 'editor', 'cuadrilla', 'auditor'] as const satisfies readonly Rol[];

// ── EJE 2 · LAS FUNCIONES ───────────────────────────────────────────────────

/**
 * Cada función: su código legible, su CÓDIGO CORTO para el token, qué es en
 * palabras, y si se puede DELEGAR (añadir a alguien por debajo de admin).
 *
 * ⚠️ El código corto es lo que va en el reclamo `f`. Cambiarlo es invalidar
 * todos los tokens vivos: no se renombra, se añade uno nuevo y se migra.
 */
export const FUNCIONES = Object.freeze({
  'lineas.ver':          { corto: 'lv', que: 'ver líneas, apoyos, atlas e informes de su alcance', delegable: true },
  'lineas.editar':       { corto: 'le', que: 'crear y editar líneas y su conductor',              delegable: true },
  'apoyos.editar':       { corto: 'ae', que: 'declarar y editar la ficha de cada apoyo',          delegable: true },
  'ficha.lote':          { corto: 'fl', que: 'aplicar un dato a varios apoyos de una vez',        delegable: false },
  'hipotesis.editar':    { corto: 'he', que: 'editar hipótesis de cálculo y umbrales',            delegable: true },
  'expedientes.editar':  { corto: 'xe', que: 'abrir y trabajar expedientes de falla (RCA)',       delegable: true },
  'evidencias.ver':      { corto: 'ev', que: 'ver fotografías y evidencias',                      delegable: true },
  'evidencias.aportar':  { corto: 'ea', que: 'subir fotografías y registrar inspecciones',        delegable: true },
  'cargar.puntos':       { corto: 'cp', que: 'cargar el trazado (GPS/KML) que crea puntos',       delegable: false },
  'cargabilidad.ver':    { corto: 'cv', que: 'ver el histórico de carga eléctrica',               delegable: true },
  'cargabilidad.cargar': { corto: 'cc', que: 'guardar mediciones de operación en el histórico',   delegable: false },
  'informes.generar':    { corto: 'ig', que: 'generar informes y exportaciones',                  delegable: true },
  'ia.leer':             { corto: 'il', que: 'leer la bitácora de llamadas a la IA',              delegable: false },
  'config.editar':       { corto: 'ce', que: 'editar la configuración operativa',                 delegable: false },
  'usuarios.gestionar':  { corto: 'ug', que: 'crear personas y asignar roles, funciones y alcance', delegable: false },
  'usuarios.auditoria':  { corto: 'ua', que: 'leer la bitácora de accesos y cambios de permiso',  delegable: false },
} as const);

export type Funcion = keyof typeof FUNCIONES;
export const CODIGOS_FUNCION = Object.keys(FUNCIONES) as Funcion[];
export const Funcion = z.enum(CODIGOS_FUNCION as [Funcion, ...Funcion[]]);

/** Código corto → función. Es la tabla que las reglas usan al revés. */
export const FUNCION_POR_CORTO: Record<string, Funcion> = Object.fromEntries(
  CODIGOS_FUNCION.map((f) => [FUNCIONES[f].corto, f]),
);

/** Las que un admin puede AÑADIR a alguien por debajo de admin. */
export const FUNCIONES_DELEGABLES = CODIGOS_FUNCION.filter((f) => FUNCIONES[f].delegable);

/**
 * LO QUE CADA ROL TRAE DE SERIE. `propietario` y `admin` traen todo; la
 * diferencia entre los dos no está aquí, está en quién puede tocar a quién.
 *
 * ⚠️ Es la traducción exacta de lo que las reglas hacían cumplir hasta el
 * 2026-09-05 por jerarquía de rol (`esEditor()`, `esCuadrilla()`…), así que
 * migrar a funciones NO cambia lo que hoy puede hacer nadie. Lo que cambia es
 * que ahora se puede afinar por persona sin inventar un rol nuevo.
 */
export const FUNCIONES_POR_ROL: Record<Rol, readonly Funcion[]> = {
  propietario: CODIGOS_FUNCION,
  admin: CODIGOS_FUNCION,
  editor: ['lineas.ver', 'lineas.editar', 'apoyos.editar', 'hipotesis.editar', 'expedientes.editar',
    'evidencias.ver', 'evidencias.aportar', 'cargabilidad.ver', 'informes.generar'],
  cuadrilla: ['lineas.ver', 'evidencias.ver', 'evidencias.aportar'],
  auditor: ['lineas.ver', 'evidencias.ver', 'cargabilidad.ver', 'informes.generar', 'ia.leer',
    'usuarios.auditoria'],
};

/**
 * Las funciones EFECTIVAS de una persona: las de su rol, más las añadidas,
 * menos las quitadas — y **solo dentro de lo delegable**. Un `admin` no puede
 * regalarle `usuarios.gestionar` a un editor por la puerta de atrás: la
 * función pura lo ignora y el trabajador además lo rechaza y lo audita.
 *
 * Determinista y ordenada: dos llamadas con la misma entrada dan el mismo
 * arreglo, que es lo que permite comparar el reclamo deseado con el real.
 */
export function funcionesEfectivas(
  rol: Rol, extras: readonly Funcion[] = [], quitadas: readonly Funcion[] = [],
): Funcion[] {
  const base = new Set<Funcion>(FUNCIONES_POR_ROL[rol]);
  if (rol !== 'propietario' && rol !== 'admin') {
    for (const f of extras) if (FUNCIONES[f]?.delegable) base.add(f);
    for (const f of quitadas) base.delete(f);
  }
  return CODIGOS_FUNCION.filter((f) => base.has(f));
}

// ── EJE 3 · LAS RESPONSABILIDADES (el alcance) ──────────────────────────────

/**
 * Sobre qué LÍNEAS actúa la persona. `['*']` = todas las de su organización.
 *
 * ⚠️ Va en el token, y por eso tiene tope: un identificador de línea son 36
 * caracteres. `PRESUPUESTO_RECLAMOS_BYTES` es lo que decide cuántas caben, y el
 * trabajador lo mide ANTES de escribir. Pasarse no trunca: se rechaza con un
 * mensaje que dice cuántas sobran y que se puede asignar `['*']`.
 */
export const TODAS_LAS_LINEAS = '*';
export const Alcance = z.array(z.string().min(1)).min(1);

/** Firebase corta en 1.000. Se deja margen para lo que Firebase añade él. */
export const PRESUPUESTO_RECLAMOS_BYTES = 900;

// ── LO QUE VIAJA EN EL TOKEN ────────────────────────────────────────────────

/**
 * Los reclamos, tal y como el trabajador los escribe y las reglas los leen.
 * Los nombres son cortos porque cada byte cuenta contra el tope.
 *
 *   orgId  — organización (existe desde el día 1, `§ADR-019 §4`)
 *   rol    — el rol, en claro: las reglas lo comparan por nombre
 *   f      — funciones efectivas, en código CORTO
 *   l      — alcance: `['*']` o identificadores de línea
 *   passwordProvisional / contrasenaOrdenadaEn — la puerta (`§ADR-024`)
 */
export const Reclamos = z.object({
  orgId: OrgId,
  rol: Rol,
  f: z.array(z.string().min(2).max(3)),
  l: Alcance,
  passwordProvisional: z.boolean().optional(),
  contrasenaOrdenadaEn: z.string().optional(),
});
export type Reclamos = z.infer<typeof Reclamos>;

/** Cuánto pesa un objeto de reclamos serializado, en bytes UTF-8. */
export function pesoDeReclamos(r: unknown): number {
  return new TextEncoder().encode(JSON.stringify(r)).length;
}

/**
 * Construye los reclamos de una persona a partir de su perfil. Es la ÚNICA
 * traducción perfil → token, y la usa el trabajador. Lanza si no cabe: mejor
 * un alta que falla con motivo que un token recortado que deja fuera una línea.
 */
export function reclamosDe(p: {
  orgId: string; rol: Rol; funcionesExtra?: readonly Funcion[]; funcionesQuitadas?: readonly Funcion[];
  lineas?: readonly string[]; passwordProvisional?: boolean; contrasenaOrdenadaEn?: string;
}): Reclamos {
  const r: Reclamos = {
    orgId: p.orgId,
    rol: p.rol,
    f: funcionesEfectivas(p.rol, p.funcionesExtra ?? [], p.funcionesQuitadas ?? []).map((x) => FUNCIONES[x].corto),
    l: p.lineas && p.lineas.length ? [...p.lineas] : [TODAS_LAS_LINEAS],
  };
  if (p.passwordProvisional) {
    r.passwordProvisional = true;
    if (p.contrasenaOrdenadaEn) r.contrasenaOrdenadaEn = p.contrasenaOrdenadaEn;
  }
  const peso = pesoDeReclamos(r);
  if (peso > PRESUPUESTO_RECLAMOS_BYTES) {
    throw new Error(`los reclamos pesan ${peso} bytes y el tope son ${PRESUPUESTO_RECLAMOS_BYTES}: `
      + `asigne el alcance como ['${TODAS_LAS_LINEAS}'] o reduzca las líneas`);
  }
  return r;
}

// ── LA PREGUNTA QUE HACE LA PANTALLA ────────────────────────────────────────

/**
 * ¿Puede esta sesión hacer esto? **Solo para DIBUJAR.** La frontera son las
 * reglas de la base y el trabajador; esto decide qué botón se muestra, y un
 * botón que la base va a rechazar «no es más seguro ni menos — es mentiroso»
 * (lección literal de uno de los CRM escaneados).
 *
 * ⚠️ Reclamo ausente = mínimo privilegio, nunca el máximo: sin `f` no se puede
 * nada, sin `l` no se ve ninguna línea. «Un reclamo ausente no es una promoción».
 */
export function puede(claims: Partial<Reclamos> | null | undefined, funcion: Funcion): boolean {
  if (!claims || !Array.isArray(claims.f)) return false;
  return claims.f.includes(FUNCIONES[funcion].corto);
}

/** ¿Alcanza esta sesión a esta línea? */
export function alcanza(claims: Partial<Reclamos> | null | undefined, lineaId: string): boolean {
  if (!claims || !Array.isArray(claims.l)) return false;
  return claims.l.includes(TODAS_LAS_LINEAS) || claims.l.includes(lineaId);
}

/** Lo que una sesión puede hacer, todo junto, para la pantalla. */
export function permisosDe(claims: Partial<Reclamos> | null | undefined) {
  return {
    rol: claims?.rol ?? null,
    funciones: CODIGOS_FUNCION.filter((f) => puede(claims, f)),
    lineas: Array.isArray(claims?.l) ? [...claims.l] : [],
    gestionaPersonas: puede(claims, 'usuarios.gestionar'),
    esPropietario: claims?.rol === 'propietario',
  };
}

// ── EL PERFIL EN LA BASE (espejo del token, para la pantalla) ───────────────

/**
 * `usuarios/{uid}`. **El token es la frontera; esto es el ESPEJO** que la
 * pantalla lee para listar, y que el trabajador escribe en la misma operación
 * en que escribe los reclamos. Si divergen —puede pasar: dos escrituras no son
 * una transacción—, `reconciliar` rehace el espejo desde el token, nunca al
 * revés. Lo escribe SOLO el servidor; el cliente solo puede dejar su recibo de
 * contraseña (`§ADR-024`) y su último acceso.
 */
export const PerfilDeUsuario = z.object({
  orgId: OrgId,
  correo: z.string().email(),
  nombre: z.string().min(1).max(120),
  rol: Rol,
  funcionesExtra: z.array(Funcion).default([]),
  funcionesQuitadas: z.array(Funcion).default([]),
  lineas: Alcance.default([TODAS_LAS_LINEAS]),
  activo: z.boolean(),
  creadoEn: Instante,
  creadoPor: Uid,
  actualizadoEn: Instante.optional(),
  actualizadoPor: Uid.optional(),
  /** Los dos que escribe la propia persona, y nada más. */
  contrasenaCambiadaEn: z.unknown().optional(),
  ultimoAcceso: z.unknown().optional(),
  /**
   * LA LÁPIDA. Cuando la cuenta de Auth se borra (`limpieza-inicial`), el perfil
   * NO se borra: queda con `activo: false` y estas dos fechas, para que cada
   * `creadoPor` de la base siga teniendo nombre. Borrar el espejo dejaría años
   * de firmas convertidas en códigos sin dueño (`99 §ADR-100`).
   */
  borradoEn: Instante.optional(),
  borradoPor: Uid.optional(),
});
export type PerfilDeUsuario = z.infer<typeof PerfilDeUsuario>;

/** Los únicos campos del perfil que el navegador puede tocar (whitelist). */
export const CAMPOS_PROPIOS_DEL_PERFIL = ['contrasenaCambiadaEn', 'ultimoAcceso'] as const;

// ── LA BITÁCORA DE ACCESOS ──────────────────────────────────────────────────

/**
 * Lista CERRADA de acciones auditables. Una bitácora que acepta cualquier
 * cadena «se convierte en un cajón donde nadie encuentra nada». Añadir una
 * acción es una decisión, no un trámite: se añade aquí y en el trabajador.
 *
 * ⚠️ La escribe SOLO el servidor, con el actor tomado del token verificado.
 * En las reglas es `allow write: if false`. Un registro que el auditado puede
 * firmar con el nombre de otro no es un registro de auditoría — lo vimos en dos
 * de los tres CRM.
 */
export const ACCIONES_AUDITABLES = [
  'alta', 'rol_cambiado', 'funciones_cambiadas', 'alcance_cambiado',
  'deshabilitado', 'restituido', 'contrasena_repuesta', 'enlace_emitido',
  'reconciliado', 'rechazado',
  /** El arranque del propietario (`99 §ADR-100`): un solo uso, con cerrojo. */
  'bootstrap',
  /** La limpieza inicial: el ensayo (simulación) y cada lote ejecutado. */
  'limpieza',
  /** Una cuenta borrada de Auth. Su lápida queda en `usuarios/{uid}`. */
  'borrado',
] as const;
export const AccionAuditable = z.enum(ACCIONES_AUDITABLES);

export const EntradaDeAuditoria = z.object({
  orgId: OrgId,
  accion: AccionAuditable,
  /** Quién lo hizo: del TOKEN del trabajador, jamás del cuerpo de la petición. */
  actorUid: Uid,
  actorCorreo: z.string().email().optional(),
  /** Sobre quién. */
  sujetoUid: Uid.optional(),
  sujetoCorreo: z.string().email().optional(),
  /** Antes → después, solo de lo que cambió. */
  antes: z.record(z.string(), z.unknown()).optional(),
  despues: z.record(z.string(), z.unknown()).optional(),
  /** Por qué se rechazó, cuando `accion === 'rechazado'`. */
  motivo: z.string().max(500).optional(),
  ip: z.string().optional(),
  en: Instante,
});
export type EntradaDeAuditoria = z.infer<typeof EntradaDeAuditoria>;

// ── LA SESIÓN: CUÁNTO DURA ──────────────────────────────────────────────────

/**
 * Dos relojes por rol, en minutos. `absoluto` corta aunque se esté usando;
 * `inactividad` corta tras ese tiempo sin tocar nada, con aviso un minuto
 * antes. `null` = sin corte.
 *
 * El criterio: quien puede cambiar permisos o reescribir un histórico (admin)
 * no deja un portátil abierto con sesión viva indefinidamente; una cuadrilla
 * en campo, con el teléfono en el bolsillo entre apoyo y apoyo, no puede estar
 * volviendo a entrar cada media hora. Uno de los CRM PERDIÓ su corte de 30 min
 * en una migración y nadie lo notó en meses: por eso esto es un dato, con
 * prueba, y no un número dentro de un componente.
 */
export const DURACION_SESION_MIN: Record<Rol, { absoluto: number | null; inactividad: number | null }> = {
  propietario: { absoluto: 8 * 60, inactividad: 30 },
  admin:       { absoluto: 8 * 60, inactividad: 30 },
  editor:      { absoluto: 12 * 60, inactividad: 60 },
  auditor:     { absoluto: 12 * 60, inactividad: 60 },
  cuadrilla:   { absoluto: 24 * 60, inactividad: null },
};

// ── LA INVITACIÓN ───────────────────────────────────────────────────────────

/**
 * Cómo recibe su primera contraseña una persona nueva. Los DOS modos existen
 * a propósito (`§ADR-100`):
 *
 *   `enlace`     — la cuenta nace con una credencial aleatoria de 256 bits que
 *                  NADIE ve, y el administrador recibe un enlace de un solo uso
 *                  para que la persona elija la suya. Es la práctica que citan
 *                  OWASP ASVS 6.4.1 y el mejor de los tres CRM. El enlace lo
 *                  entrega el administrador por el canal que él controle: no
 *                  depende del correo.
 *   `contrasena` — el administrador la teclea y la comunica él. Es lo que el
 *                  Ingeniero decidió en `§ADR-019 §2`, y se conserva: la
 *                  contraseña viaja al trabajador por TLS, nace provisional y
 *                  se exige cambiarla al primer acceso (`§ADR-024`).
 */
export const ModoDeAlta = z.enum(['enlace', 'contrasena']);
export type ModoDeAlta = z.infer<typeof ModoDeAlta>;
