// ============================================================================
// datos/permisos.ts — la ÚNICA puerta por la que la pantalla pregunta «¿puedo?»
// ----------------------------------------------------------------------------
// AQUÍ NO SE DECIDE NADA. Todo lo decide `contratos/src/usuarios.ts`, que es el
// catálogo y la fuente de verdad; esto solo sabe SACAR LOS RECLAMOS de la sesión
// que la pantalla tiene a mano y pasárselos al catálogo.
//
// POR QUÉ EXISTE ESTE ARCHIVO, en vez de que cada componente llame al catálogo:
// porque la pantalla no tiene reclamos, tiene «sesiones» de tres formas
// distintas —la del almacén, la rebanada que se le pasa a Fichas, la que recibe
// Cargabilidad—. Sin un sitio que las aplane, cada componente inventaría su
// propia manera de sacar los reclamos, y la primera que se equivocara enseñaría
// un botón que la base va a negar. Un botón así **no es más seguro ni menos: es
// mentiroso**, y eso es exactamente lo que el catálogo dice que no puede pasar.
//
// ⚠️ ESTO ES COSMÉTICO. Esconder un botón no impide nada: quien quisiera podría
// llamar a la base igual. La frontera son `firestore.rules` y el trabajador de
// personas, que miran el MISMO token del otro lado. Esto existe para que la
// persona vea lo que la base va a decidir ANTES de trabajar media hora.
//
// ⚠️ RECLAMO AUSENTE = MÍNIMO PRIVILEGIO, nunca el máximo. Sin `f` no se puede
// nada; sin `l` no se alcanza ninguna línea. «Un reclamo ausente no es una
// promoción» (catálogo, `usuarios.ts`).
// ============================================================================
import {
  Reclamos,
  permisosDe,
  puede as puedeSegunCatalogo,
  alcanza as alcanzaSegunCatalogo,
  type Funcion,
} from '@lineas/contratos';

/** Lo que devuelve el catálogo cuando se le pregunta por todo a la vez. */
export type Permisos = ReturnType<typeof permisosDe>;

/**
 * Lo mínimo que una rebanada de sesión necesita traer para poder preguntar.
 *
 * Es `claims` y no `rol` a propósito: el rol ya no decide nada por sí solo —lo
 * que decide son las FUNCIONES, que un administrador puede añadir o quitar por
 * persona sin cambiarle el rol—. El rol se sigue enseñando como texto porque es
 * lo que la persona reconoce de sí misma, pero no se compara nunca.
 */
export interface ConPermiso {
  claims?: Reclamos | null;
}

/**
 * La rebanada de sesión que viaja a los componentes que escriben.
 *
 * Se declara AQUÍ y no en cada componente para que añadir un campo no sea una
 * cacería por seis archivos — que es como se quedó uno sin `claims` y volvió a
 * decidir por el rol sin que nadie lo viera.
 */
export interface SesionDePantalla extends ConPermiso {
  correo: string | null;
  rol: string;
  orgId: string;
  uid: string;
}

/** Los reclamos de cualquiera de las formas en que llega una sesión. */
function reclamosDe(s: ConPermiso | null | undefined): Reclamos | null {
  return s && s.claims ? s.claims : null;
}

/**
 * ¿Puede esta sesión hacer esto? **Solo para dibujar.**
 *
 * `funcion` es un código del catálogo (`'apoyos.editar'`), no una cadena libre:
 * el compilador rechaza uno inventado, que es la mitad del valor de tener un
 * catálogo.
 */
export function puede(sesion: ConPermiso | null | undefined, funcion: Funcion): boolean {
  return puedeSegunCatalogo(reclamosDe(sesion), funcion);
}

/** ¿Alcanza esta sesión a esta línea? Sin `l` en el token, a ninguna. */
export function alcanza(sesion: ConPermiso | null | undefined, lineaId: string): boolean {
  return alcanzaSegunCatalogo(reclamosDe(sesion), lineaId);
}

/** Todo lo que esta sesión puede, junto, para pintarlo de una vez. */
export function permisosDeSesion(sesion: ConPermiso | null | undefined): Permisos {
  return permisosDe(reclamosDe(sesion));
}

/**
 * Lee los reclamos crudos del token y dice si sirven.
 *
 * ⚠️ SI NO VALIDAN, LOS RECLAMOS SON `null` Y LA PANTALLA NO OFRECE NADA. Es la
 * orden explícita de esta ola y es lo contrario de lo cómodo: un token viejo
 * —sin `f` ni `l`, que es como son todos los emitidos antes del catálogo— deja
 * de dar permisos en la pantalla. No es un capricho: las reglas de la base
 * miran esos mismos campos, así que ofrecer el botón sería prometer una
 * escritura que la base va a negar.
 *
 * Devuelve también el MOTIVO en castellano para que la pantalla pueda decirlo.
 * Un permiso que desaparece sin explicación se lee como una avería.
 */
export function leerReclamos(crudo: unknown): { claims: Reclamos | null; motivo: string | null } {
  const r = Reclamos.safeParse(crudo);
  if (r.success) return { claims: r.data, motivo: null };

  const faltan = r.error.issues
    .map((i) => String(i.path?.[0] ?? ''))
    .filter((x) => x === 'f' || x === 'l' || x === 'rol' || x === 'orgId');

  return {
    claims: null,
    motivo: faltan.length
      ? 'Su sesión no trae el catálogo de permisos: le faltan '
        + [...new Set(faltan)].map((f) => ETIQUETA_RECLAMO[f] ?? f).join(' y ')
        + '. Hasta que un administrador la reconcilie, esta pantalla no ofrece ninguna acción '
        + 'de escritura. No se ha tocado ningún dato suyo.'
      : 'Su sesión trae un permiso que esta versión no entiende. Por precaución no se ofrece '
        + 'ninguna acción de escritura. Avise al administrador: hay que reconciliar su cuenta.',
  };
}

/** Cómo se llama cada reclamo cuando hay que nombrárselo a una persona. */
const ETIQUETA_RECLAMO: Record<string, string> = {
  f: 'las funciones',
  l: 'el alcance por líneas',
  rol: 'el rol',
  orgId: 'la organización',
};
