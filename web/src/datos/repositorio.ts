// ============================================================================
// datos/repositorio.ts — de dónde salen los datos de la aplicación
// ----------------------------------------------------------------------------
// REGLA (orden del Ingeniero, 2026-07-29): en esta página NO hay datos
// inventados. Todo lo que se muestre sale de un levantamiento real.
//
// Y su consecuencia arquitectónica: como el sitio publicado es PÚBLICO y sin
// sesión, los datos reales NO pueden viajar dentro del paquete que se sube a
// internet — son coordenadas de infraestructura de un cliente. Llegan por
// lectura autenticada contra la base, después de iniciar sesión.
//
// Por eso el estado inicial de la página es VACÍO, y eso no es un defecto: es
// la única forma honesta de cumplir las dos cosas a la vez.
//
// Este módulo es AGNÓSTICO a la interfaz: no toca el DOM. Si mañana cambia el
// framework de pantallas, esto sobrevive intacto.
// ============================================================================
import type { AccionCapa, Apoyo, AnalisisCausa, Conductor, Evidencia, Hipotesis, Investigacion, Linea, SondeoClima } from '@lineas/contratos';

export type EstadoSesion =
  | { fase: 'comprobando' }
  | { fase: 'sin_sesion' }
  /**
   * `rol` y `orgId` viajan aquí desde 2026-08-17, y no por completismo.
   *
   * El token SIEMPRE los ha traído —`credenciales()` los devuelve desde el
   * día 1— pero **nadie los consumía**: la aplicación entera funcionaba sin
   * saber con qué permiso había entrado quien la usa. Mientras solo se leía
   * daba igual; desde que se puede ESCRIBIR, no: quien no sea administrador se
   * enteraría de que no puede cargar un punto por una denegación de la base,
   * que llega tarde, sin causa y con el archivo del GPS ya cargado en pantalla.
   *
   * ⚠️ Esto NO es la frontera de seguridad. La frontera son las reglas de la
   * base, que comprueban el mismo token del lado del servidor. Esto es higiene:
   * decirle a la persona lo que la base va a decidir, antes de que lo intente.
   */
  | { fase: 'autenticado'; uid: string; correo: string | null; rol: string; orgId: string };

/**
 * Lo que pasó al cargar puntos nuevos. NO es un booleano a propósito: una carga
 * puede escribir dos puntos, saltarse uno que ya estaba y rechazar otro por no
 * cumplir el molde, todo a la vez — y las tres cosas tienen que poder contarse.
 *
 * Los puntos se nombran por su NOMBRE, nunca por su identificador interno: el
 * acuse lo lee una persona.
 */
export interface ResultadoCarga {
  /** Los que se escribieron de verdad. */
  escritos: string[];
  /** Los que ya existían en la base y NO se volvieron a escribir. */
  yaEstaban: string[];
  /** Los que no pasaron el molde de los datos. Ninguno llegó a la base. */
  rechazados: { nombre: string; motivo: string }[];
}

export type EstadoDatos =
  | { fase: 'sin_sesion' }
  | { fase: 'cargando' }
  | { fase: 'vacio' }
  /**
   * `investigaciones` puede venir vacío: una línea sin eventos es lo normal.
   *
   * `lineas` es el PARQUE: todas las que el usuario tiene permiso de ver, para
   * que la columna izquierda las liste. Es opcional porque quien la rellena es
   * `enlace.ts` —que ya las pidió para saber cuál abrir y hasta ahora las
   * tiraba—, no cada implementación del repositorio. Si falta, la pantalla
   * lista únicamente la línea abierta: no se inventa un parque que no consta.
   */
  | { fase: 'listo'; linea: Linea; apoyos: Apoyo[]; conductor: Conductor; hipotesis: Hipotesis; investigaciones: Investigacion[]; evidencias: Evidencia[]; lineas?: Linea[];
      /** Por qué se abrió esta línea y no la que pedía el enlace. */
      avisoRuta?: string;
      /**
       * QUÉ NO SE PUDO LEER. Existe porque «vino vacío» y «no se pudo mirar» son
       * cosas distintas y la pantalla las estaba aplanando en la misma.
       *
       * Los expedientes y las fichas de foto se leen en su propio `try`, y que un
       * fallo ahí NO tumbe la vista de la línea es una decisión CORRECTA: el
       * cálculo mecánico no depende de ellos. Pero la consecuencia era que la
       * pantalla afirmaba, con estilo de estado bueno, «esta línea no tiene ningún
       * expediente de falla registrado. No es un hueco de la aplicación: es el
       * estado de la línea» — una afirmación FALSA cuando lo que pasó es que no se
       * pudo comprobar.
       *
       * Es `32 · L-44` en su forma pura: un tercer estado que la pantalla aplana
       * se convierte en un aprobado. Y aquí el aprobado puede acabar en un informe
       * firmado: alguien descarta una familia de causas «sin evidencia» cuando las
       * fotos existían y solo no se pudieron traer.
       */
      noSePudoLeer?: { investigaciones?: string; evidencias?: string } }
  /**
   * La ÚNICA pantalla que se interpone antes de entrar. Es una fase del mismo
   * almacén y no una ruta: no hay «detrás» al que saltar porque los datos de la
   * línea **no se llegan a pedir**.
   */
  | { fase: 'cambiar_contrasena'; correo: string }
  | { fase: 'error'; mensaje: string };

/**
 * EL SEGMENTO RCA — estado propio, a propósito.
 *
 * Va aparte de `EstadoDatos` y no dentro, aunque tentaba: si el análisis
 * reemplazara el estado de la línea, salir del RCA obligaría a recargarla desde
 * la base. Aquí conviven, y volver al parque es instantáneo.
 *
 * Sigue habiendo UN solo almacén y UN solo puente (ADR-005): lo que la regla
 * prohíbe es que cada componente se suscriba por su cuenta o que haya dos copias
 * del MISMO dato — no que el almacén sepa de dos cosas distintas.
 */
export type EstadoRca =
  | { fase: 'cerrado' }                                   // el segmento no está abierto
  | { fase: 'cargando' }
  | { fase: 'indice'; analisis: AnalisisCausa[]; /** Por qué se quedó en el índice viniendo de un enlace. */ avisoRuta?: string }
  | { fase: 'abierto'; analisis: AnalisisCausa; indice: AnalisisCausa[]; evidencias: Evidencia[]; acciones: AccionCapa[]; sondeos: SondeoClima[];
      /**
       * Un fallo al GUARDAR. Vive dentro de la fase «abierto» a propósito.
       *
       * Antes, cualquier fallo de escritura ponía la fase en 'error', y la
       * pantalla solo monta el editor si la fase es 'abierto': el componente se
       * desmontaba y se llevaba TODO lo que el ingeniero acababa de teclear.
       * Media mañana de razonamiento perdida por un parpadeo de red — y encima
       * el cartel decía «No se pudo leer» cuando lo que había fallado era
       * escribir.
       *
       * Leer y escribir fallan distinto y se cuentan distinto: si no se puede
       * LEER no hay nada que enseñar y la pantalla entera es el error; si no se
       * puede ESCRIBIR, lo que hay en pantalla sigue siendo válido y es justo lo
       * que no se debe tirar.
       */
      falloAlGuardar?: { mensaje: string; queSeIntentaba: string } }
  | { fase: 'error'; mensaje: string };

/**
 * Contrato del repositorio. Hoy solo existe la implementación que reporta
 * "sin sesión"; cuando Firestore esté habilitado entra la real detrás de esta
 * misma interfaz, sin tocar la capa de pantallas.
 */
export interface Repositorio {
  sesion(): Promise<EstadoSesion>;
  /** Líneas que el usuario autenticado tiene permiso de ver. */
  listarLineas(): Promise<Linea[]>;
  cargarLinea(lineaId: string): Promise<EstadoDatos>;
  /** Los análisis de causa raíz de la organización. Vacío es un resultado válido. */
  listarAnalisis(): Promise<AnalisisCausa[]>;
  /** Abre un análisis. Devuelve su id, o `null` si no hay sesión u organización. */
  crearAnalisis(datos: { titulo: string; lineaId?: string; apoyoId?: string; investigacionId?: string; sinActivo?: string }): Promise<string | null>;
  /**
   * Guarda una PARTE completa del análisis (las espinas, las cadenas, el árbol,
   * las hipótesis…). Cada parte se manda entera, nunca a trozos: son listas con
   * sentido propio y guardarlas por pedazos abriría un estado a medias entre dos
   * escrituras.
   */
  guardarParte(analisisId: string, parche: Record<string, unknown>, revision: number): Promise<void>;
  /** Las evidencias que un análisis puede enlazar: las de sus investigaciones y las suyas propias. */
  evidenciasDeAnalisis(analisisId: string, investigacionIds: string[]): Promise<Evidencia[]>;

  /**
   * Las acciones CAPA de un análisis. Viven en su PROPIA colección, no dentro
   * del análisis: una acción sigue ejecutándose meses después de que el informe
   * se firme, y con las acciones dentro del documento habría que elegir entre
   * congelar el razonamiento o dejarlo editable. Se pueden las dos cosas.
   */
  listarAcciones(analisisId: string): Promise<AccionCapa[]>;
  /** Da de alta una acción. Nace `propuesta` y sin barrera: nada se presupone. */
  crearAccion(analisisId: string, datos: { clase: 'correctiva' | 'preventiva'; que: string }): Promise<string | null>;
  /** Guarda un cambio de una acción. Se valida contra el contrato antes de escribir. */
  guardarAccion(accionId: string, parche: Record<string, unknown>, revision: number): Promise<void>;

  /** Cuándo cambió su contraseña esta persona, o `null`. Nunca lanza. */
  reciboContrasena(): Promise<number | null>;
  /** Deja constancia del cambio. La fecha la pone el servidor. */
  dejarReciboContrasena(): Promise<void>;

  /** Los sondeos de clima ya guardados de un análisis. */
  listarSondeos(analisisId: string): Promise<SondeoClima[]>;
  /**
   * Congela un sondeo en el expediente.
   *
   * NO es una caché: es un HECHO FECHADO. Si mañana IDEAM corrige la serie, el
   * informe firmado tiene que seguir mostrando lo que se consultó el día que se
   * firmó — por eso las reglas hacen `sondeos_clima` inmutable: se crea y no se
   * actualiza, ni por el administrador.
   */
  guardarSondeo(analisisId: string, sondeo: Record<string, unknown>): Promise<string | null>;

  /**
   * Crea puntos nuevos de una línea que YA existe. Solo AÑADE: no reescribe ni
   * borra nada de lo que ya está.
   *
   * Los documentos llegan ya construidos por `@lineas/importar`, que es código
   * puro y probado. Este método no construye ninguno: comprueba el permiso,
   * sella el autor con la sesión abierta, valida contra el molde y escribe.
   *
   * LANZA con un mensaje legible cuando la carga entera no procede (sin sesión,
   * sin permiso de administrador, sin organización en el token). Lo que falla
   * punto a punto NO lanza: viaja dentro del resultado, porque negarle al
   * Ingeniero los dos buenos por culpa del tercero sería castigarle por haber
   * traído más información.
   */
  cargarPuntosNuevos(documentos: Record<string, unknown>[], idsYaCargados?: string[]): Promise<ResultadoCarga>;
}

/**
 * Implementación provisional. No inventa nada: declara que no hay sesión.
 * Se sustituye por la de Firestore en cuanto la base esté creada.
 */
export const repositorioSinSesion: Repositorio = {
  async sesion() {
    return { fase: 'sin_sesion' };
  },
  async listarLineas() {
    return [];
  },
  async cargarLinea() {
    return { fase: 'sin_sesion' };
  },
  async listarAnalisis() {
    return [];
  },
  async crearAnalisis() {
    return null;
  },
  async guardarParte() {
    /* sin sesión no se escribe nada */
  },
  async evidenciasDeAnalisis() {
    return [];
  },
  async listarAcciones() {
    return [];
  },
  async crearAccion() {
    return null;
  },
  async guardarAccion() {
    /* sin sesión no se escribe nada */
  },
  async reciboContrasena() {
    return null;
  },
  async dejarReciboContrasena() {
    /* sin sesión no se escribe nada */
  },
  async listarSondeos() {
    return [];
  },
  async guardarSondeo() {
    return null;
  },
  async cargarPuntosNuevos() {
    // Sin sesión no se escribe nada, y se dice con esas palabras: devolver una
    // carga «vacía y correcta» haría creer que se cargó y que el archivo no
    // traía nada.
    throw new Error('No hay ninguna sesión abierta: no se puede cargar ningún punto.');
  },
};

export let repositorio: Repositorio = repositorioSinSesion;

/** Punto único de sustitución cuando entre Firestore. */
export function usarRepositorio(r: Repositorio): void {
  repositorio = r;
}
