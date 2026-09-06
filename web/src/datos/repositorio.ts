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
import type { AccionCapa, Apoyo, AnalisisCausa, Conductor, EntradaDeAuditoria, Evidencia, Hipotesis, Investigacion, Linea, Reclamos, SondeoClima } from '@lineas/contratos';
import type { Permisos } from './permisos';

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
  | { fase: 'autenticado'; uid: string; correo: string | null; rol: string; orgId: string;
      /**
       * LOS TRES EJES DEL CATÁLOGO, tal y como el token los trae y ya validados
       * (`contratos/src/usuarios.ts`). `null` significa que **no validaron**, y
       * eso es MÍNIMO PRIVILEGIO: sin `f` no se puede nada, sin `l` no se
       * alcanza ninguna línea. Un reclamo ausente no es una promoción.
       *
       * Es lo que sustituye a comparar `rol === 'admin'` por toda la pantalla.
       * El `rol` sigue aquí porque se ENSEÑA —la persona se reconoce en él— y
       * porque los mensajes de la base lo nombran; pero ya no decide nada.
       */
      claims: Reclamos | null;
      /** Por qué no valieron los reclamos, para poder decirlo en pantalla. */
      motivoDeReclamos: string | null;
      /** Lo que esta sesión puede, ya derivado del catálogo. Para dibujar. */
      permisos: Permisos;
      /** Cuándo abrió Firebase esta sesión. Base del reloj absoluto. */
      autenticadoEn: number | null };

/**
 * UNA LÍNEA DE LA BITÁCORA, tal y como la pantalla la lee.
 *
 * Es la entrada del catálogo más el identificador del documento: la bitácora se
 * lista y hace falta una clave estable para pintarla. Todo lo demás lo valida el
 * molde del catálogo antes de entrar — una bitácora que acepta cualquier forma
 * es un cajón donde nadie encuentra nada.
 */
export type EntradaLeidaDeAuditoria = EntradaDeAuditoria & { id: string };

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

/**
 * LA FICHA DE UNA FOTO que la pantalla quiere escribir. La pantalla la arma
 * entera salvo tres campos: `orgId`, `creadoPor` y `creadoEn`, que los pone la
 * capa de datos con la SESIÓN abierta. No es una comodidad: `firestore.rules`
 * (`altaCoherente`) exige que el autor sea exactamente quien escribe, y la
 * denegación de un lote es opaca — la base no dice cuál de los documentos la
 * causó.
 */
export interface FichaDeFoto {
  /** El identificador ya derivado de la HUELLA del archivo. Nunca de una posición. */
  id: string;
  apoyoId: string;
  lineaId: string;
  rutaObjeto: string;
  sha256: string;
  bytes: number;
  mime: string;
  tomadaEn?: string;
  /** El nombre del punto, para poder acusar en el idioma del Ingeniero. */
  punto: string;
}

/** Qué entró y qué no, contado POR PUNTO — nunca por identificador. */
export interface ResultadoFotos {
  /** Cuántas fichas se escribieron de verdad, por punto. */
  escritas: { punto: string; fotos: number }[];
  /** Las que ya estaban y NO se volvieron a escribir. */
  yaEstaban: { punto: string; fotos: number }[];
  /** Las que quedaron fuera, con el motivo en castellano. */
  fuera: { punto: string; archivo: string; motivo: string }[];
}

/**
 * Lo que se escribió en UNA ficha, para que el acuse lo pueda contar.
 *
 * Los campos se nombran EN CASTELLANO y con su origen: el acuse lo lee el
 * Ingeniero, y «se guardó `alturaLibre_m`» no le dice nada. «Altura libre sobre
 * el terreno — medida en el sitio» sí, y es exactamente lo que tendrá que
 * defender el día que firme.
 */
export interface AcuseDeFicha {
  /** Nombre visible del apoyo. Nunca su identificador interno. */
  apoyo: string;
  /** La revisión que quedó en la base. Sube exactamente uno. */
  revision: number;
  campos: { etiqueta: string; origen: string; fuente: string | null }[];
}

/**
 * Lo que pasó al aplicar un dato de catálogo a varios apoyos.
 *
 * `yaLoTenian` NO es un detalle: el lote SOLO RELLENA HUECOS y jamás pisa un
 * valor declarado — así es como se pierde un dato medido debajo de uno de
 * catálogo. Los que quedaron fuera se NOMBRAN, para que quien mira sepa que no
 * se le olvidaron: se respetaron.
 */
export interface AcuseDeLote {
  escritos: { apoyo: string; revision: number }[];
  yaLoTenian: { apoyo: string; campos: string[] }[];
  campos: { etiqueta: string; origen: string; fuente: string | null }[];
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
      falloAlGuardar?: { mensaje: string; queSeIntentaba: string };
      /**
       * Qué NO se pudo LEER al abrir el expediente, y por qué.
       *
       * El tercer estado que ya tiene la línea (`ADR-032`, `32 · L-44`), traído
       * al expediente: «llegó con datos» · «llegó vacío» · «no se pudo leer».
       * Sin él, un fallo de lectura de las evidencias se pintaba como «este
       * análisis no tiene ninguna evidencia disponible» — y con esa frase
       * delante alguien descarta una familia de causas «por falta de evidencia»
       * cuando las fotos existían y solo no se pudieron traer. Eso entra en un
       * informe firmado.
       */
      noSePudoLeer?: { evidencias?: string; acciones?: string; sondeos?: string } }
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

  /**
   * Deja constancia de que esta persona entró, en su propio perfil.
   *
   * La fecha la pone el SERVIDOR (`request.time`), como el recibo de contraseña:
   * así no se puede fechar hacia atrás desde la consola del navegador. Y **no
   * lanza nunca**: entrar no puede depender de que se escriba una fecha. Los
   * fallos se CUENTAN y se pueden mirar (`bitacora.ts`); lo que no se hace es
   * tragárselos con un `catch` vacío, que es como se pierde una bitácora entera
   * sin que nadie se entere.
   */
  dejarUltimoAcceso(): Promise<void>;

  /**
   * La bitácora de accesos y cambios de permiso.
   *
   * Se lee DIRECTO de la base, no por el trabajador: las reglas ya dejan leerla
   * a quien tiene `usuarios.auditoria`, y hacerla pasar por un trabajador solo
   * añadiría un salto que puede fallar. La ESCRIBE únicamente el servidor.
   */
  listarAuditoria(filtro?: { accion?: string; sujetoUid?: string; tope?: number }): Promise<EntradaLeidaDeAuditoria[]>;

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

  /**
   * Escribe las FICHAS de un lote de fotografías ya subidas al depósito.
   *
   * ⚠️ EL ORDEN IMPORTA Y ES A PROPÓSITO: primero el objeto, después la ficha.
   * Al revés dejaría una ficha apuntando al vacío, que es justo lo que la
   * galería enseña como error. Un objeto sin ficha no lo ve nadie y no duplica
   * nada al repetir la subida; una ficha sin objeto rompe una pantalla.
   *
   * LANZA cuando la operación entera no procede (sin sesión, sin permiso, sin
   * organización). Lo que falle foto a foto viaja en el resultado.
   */
  crearEvidencias(fichas: FichaDeFoto[]): Promise<ResultadoFotos>;

  /**
   * Escribe la FICHA ESTRUCTURAL de UN apoyo: los seis datos que le faltan para
   * poder tener veredicto, cada uno con su sello de procedencia.
   *
   * `revision` es la que la pantalla tenía cuando abrió la ficha. Si en la base
   * ya no es ésa, NO se escribe nada y se lanza con las tres partes que la
   * prueba exige: qué pasó, que no se escribió nada, y qué hacer.
   *
   * Lo puede hacer un EDITOR: es lo que permiten las reglas para un apoyo.
   */
  guardarFichaApoyo(apoyoId: string, ficha: Record<string, unknown>, revision: number): Promise<AcuseDeFicha>;

  /**
   * Aplica un dato DE CATÁLOGO a varios apoyos a la vez.
   *
   * ⚠️ SOLO admite los tres campos que son propiedad del MODELO del apoyo
   * —carga de rotura, capacidad longitudinal y tipo de apoyo—, porque vienen de
   * un documento y ese documento es EL MISMO para todos: la procedencia no
   * miente, es una y es la del papel.
   *
   * Los otros tres —altura libre, altura del amarre y conductores que amarran—
   * NO entran por aquí y no hay puerta trasera: el empotramiento depende del
   * terreno y no se ve desde un escritorio, y un terminal amarra todas las fases
   * mientras un apoyo de paso puede no amarrar ninguna. Copiarlos es el error
   * que el contrato prohíbe por escrito.
   *
   * Exige ADMINISTRADOR, no editor: el daño de un lote no es el mismo. Y es
   * ATÓMICO — si a un solo apoyo lo tocó otra persona, no entra ninguno y el
   * mensaje lo nombra.
   */
  guardarFichaApoyoEnLote(
    apoyoIds: string[],
    ficha: Record<string, unknown>,
    revisiones: Record<string, number>,
  ): Promise<AcuseDeLote>;

  /**
   * Declara si el VANO QUE SALE de un apoyo lleva cable de guarda.
   *
   * Va por su cuenta y NO por la ficha estructural, a propósito: la ficha son
   * los seis datos que dan VEREDICTO a un apoyo, y esto no da ninguno — es
   * inventario de la protección de la línea, y el molde de la ficha rechaza por
   * diseño lo que no es suyo. Meterlo ahí habría obligado a aflojar el molde que
   * protege el veredicto para colar un dato que no lo toca.
   *
   * `null` BORRA la declaración y devuelve el vano a «no consta» — que no es lo
   * mismo que «lleva guarda». Hace falta poder deshacer una marca equivocada sin
   * dejar afirmado lo contrario de lo que se quiso decir.
   *
   * Mismo cerrojo de revisión que la ficha: si en la base ya no es ésa, no se
   * escribe nada.
   */
  declararCableGuarda(
    apoyoId: string,
    valor: 'presente' | 'ausente' | null,
    revision: number,
  ): Promise<{ apoyo: string; revision: number; valor: 'presente' | 'ausente' | null }>;
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
  async dejarUltimoAcceso() {
    /* sin sesión no se escribe nada */
  },
  async listarAuditoria() {
    return [];
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
  async crearEvidencias() {
    // Un acuse vacío se leería como «entraron todas y no había ninguna».
    throw new Error('No hay ninguna sesión abierta: no se puede escribir la ficha de ninguna fotografía.');
  },
  async guardarFichaApoyo() {
    // Igual que arriba: un acuse vacío se leería como «guardado y sin novedad».
    throw new Error('No hay ninguna sesión abierta: no se puede guardar la ficha de ningún apoyo.');
  },
  async guardarFichaApoyoEnLote() {
    throw new Error('No hay ninguna sesión abierta: no se puede guardar la ficha de ningún apoyo.');
  },
  async declararCableGuarda(): Promise<never> {
    throw new Error('Todavía no hay base de datos conectada: no se puede declarar el cable de guarda.');
  },
};

export let repositorio: Repositorio = repositorioSinSesion;

/** Punto único de sustitución cuando entre Firestore. */
export function usarRepositorio(r: Repositorio): void {
  repositorio = r;
}
