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
import type { AccionCapa, Apoyo, AnalisisCausa, Conductor, EntradaDeAuditoria, Evidencia, Hipotesis, Investigacion, Levantamiento, Linea, Reclamos, SondeoClima, TramoCompartidoEnLinea } from '@lineas/contratos';
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
 * QUÉ SE PIDE DE LA BITÁCORA, y desde dónde.
 *
 * `desde` es el testigo OPACO de la página anterior — quien lo recibe solo lo
 * devuelve tal cual. Sale así a propósito: por dentro es un documento de
 * Firestore, y si su tipo asomara a la pantalla, `Usuarios.tsx` acabaría
 * importando el SDK de la base para pintar un botón (ADR-005: ningún componente
 * habla con la base por su cuenta).
 */
/**
 * CUÁNTAS ANOTACIONES TRAE UNA PÁGINA DE LA BITÁCORA.
 *
 * 50, y no las 200 de antes, porque la bitácora crece para siempre: cada acceso
 * y cada cambio de permiso deja una línea. Traerlas todas de golpe convierte
 * abrir la pantalla de personas en una descarga que crece sola, y en Firestore
 * cada documento leído se paga aunque nadie lo mire. Lo que falta se pide con
 * «Ver más» (`99 §ADR-100`).
 *
 * Vive AQUÍ, en el molde, y no en el repositorio real ni en el componente:
 * la pantalla dice en voz alta de cuántas en cuántas trae, y ese número tiene
 * que ser el mismo que la consulta usa o el aviso sería mentira.
 */
export const PAGINA_DE_AUDITORIA = 50;

export interface FiltroDeAuditoria {
  accion?: string;
  sujetoUid?: string;
  /** Cuántas anotaciones trae UNA página. */
  tope?: number;
  /** Testigo devuelto por la página anterior. Sin él se empieza por el principio. */
  desde?: unknown;
}

/**
 * UNA PÁGINA de la bitácora.
 *
 * ⚠️ `cursor: null` significa «no hay más», y es lo único que la pantalla debe
 * mirar para decidir si ofrece «Ver más». Contar las filas devueltas NO sirve:
 * los filtros de acción y de persona se aplican en el cliente, así que una
 * página legítima de 50 anotaciones puede quedarse en cero después de filtrar —
 * y esconder el botón ahí dejaría el resto de la bitácora invisible para
 * siempre, que es justo el tipo de hueco que esta pantalla existe para evitar.
 */
export interface PaginaDeAuditoria {
  filas: EntradaLeidaDeAuditoria[];
  cursor: unknown | null;
}

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

// ════════════════════════════════════════════════════════════════════════════
// EL ALTA DE UNA LÍNEA — los dos acuses que se CUENTAN, no se afirman
// ────────────────────────────────────────────────────────────────────────────
// Los dos acuses de abajo tienen la misma forma a propósito, y la parte que
// importa es la que se llama `releido…`: lo que la base DEVUELVE cuando se le
// vuelve a preguntar por el documento recién escrito. No es ceremonia.
//
// Una escritura de Firestore que no lanza significa «la base la aceptó», y eso
// no es lo mismo que «está escrito lo que yo creía». Aquí no hay forma de
// deshacer —una línea no se borra y un levantamiento tampoco—, así que el acuse
// no puede ser una frase del sistema sobre sí mismo: es un conteo de lo que se
// pidió contra lo que se volvió a leer, y si no cuadra, el acuse lo dice y sale
// en rojo. El fallo que esto cierra ya está medido en este repositorio: escribir
// menos de lo enseñado no da error en ninguna capa (`35 · L-79`).
//
// `releido…` en `null` NO es «no se escribió»: es «no se pudo comprobar», que es
// un tercer estado y se enseña con esas palabras.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Lo que pasó al dar de alta UNA línea.
 *
 * `yaEstaba` es el caso que evita el desastre silencioso: el identificador de
 * una línea sale del libro de códigos y es SIEMPRE el mismo para un código, así
 * que volver a pulsar el alta caería sobre el mismo documento. Las reglas dejan
 * a quien tiene `lineas.editar` ACTUALIZAR una línea, o sea que un segundo
 * guardado no daría error: **pisaría** la que ya está, con su conductor, sus
 * hipótesis y sus tramos declarados. Por eso se mira antes y no se escribe.
 */
export interface AcuseDeLineaNueva {
  /** El código con el que se dio de alta. Nunca el identificador interno. */
  codigo: string;
  /** El identificador del documento, para poder abrirla al volver. */
  id: string;
  /** `true` = ya existía en la base y NO se volvió a escribir. */
  yaEstaba: boolean;
  /**
   * La línea tal y como la base la devolvió DESPUÉS de escribirla. `null` = la
   * escritura pasó pero la relectura no se pudo hacer: no se afirma nada.
   */
  releida: {
    codigo: string;
    nombre: string;
    tensionNominal_kV: number;
    circuitos: number;
    /** Cuántos tramos compartidos quedaron declarados en el documento. */
    tramosCompartidos: number;
  } | null;
}

/**
 * Lo que pasó al guardar UN levantamiento.
 *
 * `puntosEnviados` contra `puntosReleidos` es todo el sentido de este acuse: son
 * los dos números que hay que ver juntos para saber si la jornada entera quedó
 * guardada. «Se escribió» con 27 de 28 puntos es exactamente el fallo que no da
 * error en ninguna capa.
 *
 * `yaEstaba` sale de una comprobación hecha ANTES de escribir, y es obligatoria:
 * el identificador de un levantamiento se deriva de la fecha de la jornada y de
 * la huella del archivo, así que cargar dos veces el mismo GPX cae sobre el
 * mismo documento — y ahí `firestore.rules` solo deja mover la nota, de modo que
 * el segundo guardado se caería con «Missing or insufficient permissions»: «no
 * tienes permiso» donde la verdad es «esto ya estaba cargado» (`35 · L-24`).
 */
export interface AcuseDeLevantamiento {
  /** El código de la serie a la que se anotó: «LN-617», «TR-618». */
  codigoSerie: string;
  /** El identificador del documento. */
  id: string;
  /** El día de la jornada de campo, `AAAA-MM-DD`. */
  fecha: string;
  /** Cuántos puntos se mandaron a la base. */
  puntosEnviados: number;
  /** Cuántos trajo la base al releer. `null` = no se pudo comprobar. */
  puntosReleidos: number | null;
  /** `true` = ese archivo ya estaba cargado y NO se volvió a escribir. */
  yaEstaba: boolean;
}

// ════════════════════════════════════════════════════════════════════════════
// LAS SERIES DE UNA LÍNEA — la mitad PENSANTE de la lectura
// ────────────────────────────────────────────────────────────────────────────
// Desde 0.16.0 los puntos de una línea pueden vivir en DOS sitios: los suyos
// —`apoyo.lineaId` = id de la línea— y los del TRAMO COMPARTIDO que recorre
// —`apoyo.lineaId` = id del tramo—, que se registran UNA sola vez aunque dos
// líneas pasen por ellos (`contratos/src/activos.ts §TramoCompartidoEnLinea`).
//
// ⚠️ POR QUÉ ESTAS FUNCIONES VIVEN AQUÍ Y NO EN `firestore.ts`. `firestore.ts`
// no se puede importar desde `node --test`: arrastra el SDK de Firebase. Todo
// lo que decida QUÉ se lee, QUÉ se junta y QUÉ se descarta tiene que poder
// probarse sin base de datos, o se prueba leyendo el archivo como texto — que
// es comprobar que el código está escrito, no que hace lo que dice. Aquí se
// decide; allí solo se pide. Es el mismo corte que ya tienen la ficha
// estructural (`vistas/fichaEstructural.ts`) y el cable de guarda.
//
// Este módulo NO importa nada en tiempo de ejecución: todos sus `import` son de
// tipos y desaparecen al compilar. Que siga así — es lo que lo hace importable
// desde una prueba y lo que impide que crezca hasta ser una segunda capa.
// ════════════════════════════════════════════════════════════════════════════

/**
 * UNA SERIE: el espacio de identidad al que pertenece un punto.
 *
 * O es la propia LÍNEA (`LN-627`) o es un TRAMO COMPARTIDO (`TR-618`). El
 * campo del apoyo sigue llamándose `lineaId` —los cambios son aditivos y
 * renombrarlo movería documentos que no se pueden borrar—, así que lo que
 * cambia es cómo se LEE: «id de la serie».
 */
export interface SerieDeLinea {
  tipo: 'linea' | 'tramo';
  /** El valor que llevan sus puntos en `lineaId`. */
  id: string;
  /** El rótulo legible: «LN-627», «TR-618». Se enseña, no se consulta. */
  codigo: string;
  /** Ausentes los dos = la línea recorre el tramo entero. */
  desdeApoyoId?: string;
  hastaApoyoId?: string;
}

/**
 * DE QUÉ SERIES SE LEEN LOS PUNTOS DE ESTA LÍNEA.
 *
 * La propia va SIEMPRE la primera y siempre está: una línea es su propia serie
 * aunque no tenga ni un punto. Detrás, un tramo por cada declaración ABIERTA.
 *
 * ⚠️ LAS CERRADAS NO CUENTAN, y no se borran nunca (`CierreDeTramoCompartido`):
 * «esta línea recorrió ese tramo hasta el 12-03» sigue siendo cierto, y el
 * informe que se firmó con esas torres dentro tiene que poder defenderse. Lo
 * que no puede es seguir trayendo torres a la pantalla de hoy.
 *
 * Una línea SIN `tramosCompartidos` —todas las que hay escritas— devuelve
 * exactamente una serie: la suya. Por eso abrirla hace las mismas consultas que
 * hacía ayer, y hay prueba que las cuenta.
 */
export function seriesDeLinea(
  linea: Pick<Linea, 'id' | 'codigo'> & { tramosCompartidos?: TramoCompartidoEnLinea[] },
): SerieDeLinea[] {
  const series: SerieDeLinea[] = [{ tipo: 'linea', id: linea.id, codigo: linea.codigo }];
  // El id de la propia línea entra en los vistos: si alguien declarara como
  // tramo el id de su propia línea, se leería dos veces la misma consulta y
  // cada punto saldría duplicado en pantalla.
  const vistos = new Set<string>([linea.id]);
  for (const t of linea.tramosCompartidos ?? []) {
    if (t.cierre) continue;
    if (!t?.id || vistos.has(t.id)) continue;
    vistos.add(t.id);
    series.push({
      tipo: 'tramo',
      id: t.id,
      codigo: t.codigo,
      ...(t.desdeApoyoId ? { desdeApoyoId: t.desdeApoyoId } : {}),
      ...(t.hastaApoyoId ? { hastaApoyoId: t.hastaApoyoId } : {}),
    });
  }
  return series;
}

/**
 * EL LIBRO DE CÓDIGOS, YA LEÍDO: código de serie → identificador permanente.
 *
 * Es un tipo y no un valor porque este módulo **no importa nada en tiempo de
 * ejecución**: quien trae el libro de verdad es `datos/registroCodigos.ts`, y
 * aquí solo se consulta lo que llegue. Así la comprobación se puede probar con
 * un libro inventado, sin base y sin archivo.
 */
export type LibroDeCodigos = ReadonlyMap<string, string>;

/** Lo que queda de una línea después de cruzar sus series con el libro. */
export interface SeriesAvaladas {
  /** Las que se pueden leer. La propia SIEMPRE está. */
  series: SerieDeLinea[];
  /** Lo que se dejó fuera, y por qué. Va a la vista como aviso. */
  avisos: string[];
}

/**
 * EL CÓDIGO Y EL ID DE UN TRAMO TIENEN QUE CUADRAR EN EL LIBRO.
 *
 * ⚠️ QUÉ SE ESTÁ EVITANDO, en concreto. Una declaración de tramo lleva dos
 * campos independientes: el `codigo` que se ENSEÑA y el `id` con el que se
 * PIDEN las torres. El molde no puede cruzarlos —no puede importar el libro—,
 * así que sin esta comprobación una línea que declare
 * `{ codigo: 'TR-618', id: <el id de otra línea> }` se trae las torres de esa
 * otra línea **rotuladas como del tramo compartido**: torres por las que no
 * pasa, dentro de su cálculo y de su informe, sin un solo aviso. Y al revés, un
 * id con un dígito cambiado trae cero torres, también en silencio.
 *
 * LA REGLA, y por qué es asimétrica:
 *   · Un TRAMO que no cuadre **no se lee**. Ni se consulta: se ahorra la
 *     lectura y, sobre todo, no entra ni una torre ajena. Un hueco que se ve es
 *     barato; una torre de más en un papel firmado, no.
 *   · La serie PROPIA nunca se deja fuera. Su id no sale de una declaración:
 *     es el documento que se acaba de abrir. Dejarla fuera por un desacuerdo
 *     del libro convertiría un rótulo mal anotado en una línea sin torres, que
 *     es peor daño que el que se quiere evitar. Si el libro la conoce y
 *     discrepa, se AVISA y se sigue.
 *   · Sin libro no se comprueba nada, y es deliberado: hay llamadores que no lo
 *     tienen (`vecinasDeLinea` trabaja sobre el parque en memoria). Quien lee
 *     torres SÍ lo pasa, y hay una prueba que lo vigila.
 *
 * Un código que el libro no conoce se rechaza igual que uno que no cuadra: el
 * libro se despliega con el repositorio y no se puede editar desde la
 * aplicación, así que «no está anotado» significa que nadie lo emitió.
 */
export function seriesAvaladas(series: SerieDeLinea[], libro?: LibroDeCodigos): SeriesAvaladas {
  if (!libro) return { series, avisos: [] };
  const avisos: string[] = [];
  const admitidas: SerieDeLinea[] = [];
  for (const serie of series) {
    const delLibro = libro.get(serie.codigo);
    const cuadra = delLibro === serie.id;
    if (serie.tipo === 'linea') {
      // Nunca se deja fuera: es el documento abierto, no una declaración.
      if (delLibro && !cuadra) {
        avisos.push(
          `El libro de códigos del sistema dice que «${serie.codigo}» es la serie ${delLibro}, y la línea `
          + `abierta es ${serie.id}. Sus torres se enseñan igual —son las suyas—, pero el rótulo y el `
          + 'identificador no concuerdan: conviene revisarlo antes de firmar nada con ellas dentro.',
        );
      }
      admitidas.push(serie);
      continue;
    }
    if (!delLibro) {
      avisos.push(
        `No se han traído las torres del tramo compartido ${serie.codigo}: ese código no está en el libro `
        + 'de códigos del sistema, así que no hay forma de comprobar que el identificador con el que se '
        + 'piden sus torres sea el suyo. Un código de serie se anota en el repositorio antes de usarlo.',
      );
      continue;
    }
    if (!cuadra) {
      avisos.push(
        `No se han traído las torres del tramo compartido ${serie.codigo}: esta línea lo declara con el `
        + `identificador ${serie.id} y el libro de códigos dice que ${serie.codigo} es ${delLibro}. `
        + 'Traerlas habría metido en esta línea torres de otra serie, rotuladas como del tramo, y esas '
        + 'torres entran en el cálculo y en el informe.',
      );
      continue;
    }
    admitidas.push(serie);
  }
  return { series: admitidas, avisos };
}

/**
 * EL TROZO DEL TRAMO QUE ESTA LÍNEA RECORRE.
 *
 * Los puntos llegan ya ordenados por `orden` (es lo que pide la consulta), así
 * que acotar es cortar entre dos ids. Sin `desde` ni `hasta` se recorre entero,
 * que es el caso de hoy.
 *
 * ⚠️ SI UN EXTREMO NO ESTÁ, NO SE DEVUELVE EL TRAMO ENTERO: se devuelve NADA y
 * se dice. Devolver todo «por si acaso» metería en la línea torres por las que
 * no pasa, y esas torres entran en el cálculo y en el informe. Un hueco que se
 * ve es barato; una torre de más en un papel firmado, no.
 */
export function recorteDeSerie(apoyos: Apoyo[], serie: SerieDeLinea): { apoyos: Apoyo[]; aviso?: string } {
  const { desdeApoyoId, hastaApoyoId } = serie;
  if (!desdeApoyoId && !hastaApoyoId) return { apoyos };

  const i = desdeApoyoId ? apoyos.findIndex((a) => a.id === desdeApoyoId) : 0;
  const j = hastaApoyoId ? apoyos.findIndex((a) => a.id === hastaApoyoId) : apoyos.length - 1;

  if (i === -1 || j === -1) {
    return {
      apoyos: [],
      aviso: `El tramo compartido ${serie.codigo} está acotado a un punto que no está registrado en él, `
        + 'así que no se ha traído ninguna de sus torres. No se traen todas «por si acaso»: serían '
        + 'torres por las que esta línea no pasa, y entrarían en el cálculo.',
    };
  }
  if (i > j) {
    return {
      apoyos: [],
      aviso: `El tramo compartido ${serie.codigo} está acotado al revés —el punto de inicio va después `
        + 'del de final en el orden del tramo—, así que no se ha traído ninguna de sus torres. '
        + 'Recorrer un tramo en sentido contrario a su numeración todavía no está resuelto.',
    };
  }
  return { apoyos: apoyos.slice(i, j + 1) };
}

/** Lo que salió de leer todas las series de una línea. */
export interface LecturaDeSeries {
  /** Los puntos de todas las series, juntados por `orden`. */
  apoyos: Apoyo[];
  /**
   * Lo que se decidió NO juntar, y por qué. Va a la vista como AVISO, nunca
   * sustituyendo el estado: un tramo que no se pudo acotar no puede dejar sin
   * pantalla a una línea que sí tiene sus propios puntos (`99 §ADR-032`).
   */
  avisos: string[];
  /**
   * Qué serie no se pudo LEER, y por qué. «No hay torres» y «no se pudieron
   * mirar las torres» son cosas distintas, y aplanarlas en la misma convierte
   * un fallo de permisos en la afirmación de que la línea está vacía
   * (`32 · L-44`).
   */
  noSePudoLeer?: string;
}

/**
 * JUNTA LO LEÍDO DE VARIAS SERIES EN UNA SOLA LÍNEA DE PUNTOS, por `orden`.
 *
 * ⚠️ LA REGLA DURA: LOS RANGOS DE `orden` DE DOS SERIES NO SE PUEDEN SOLAPAR.
 * `orden` es lo que ORDENA los vanos, y dos series numeradas 1…28 cada una no
 * dicen cuál va antes: al juntarlas por `orden` saldrían intercaladas y los
 * vanos —la distancia entre puntos consecutivos— serían inventados. Y con los
 * vanos mal salen mal la flecha, el gálibo y la cantidad de conductor.
 *
 * Cuando chocan NO se mezcla y NO se elige: se enseñan solo los puntos PROPIOS
 * de la línea (lo que se veía ayer) y se dice qué tramo quedó fuera y por qué.
 * Proyectar el orden de un tramo dentro del de una línea es una decisión de
 * ingeniería con dueño, y ese dueño no es el lector de la base.
 *
 * Esta comprobación es, además, el guardián de «un solo tramo por línea» del
 * diseño: dos tramos con numeración propia chocan y se rechazan solos; dos
 * tramos realmente disjuntos se juntan sin ambigüedad.
 */
export function juntarSeries(
  partes: { serie: SerieDeLinea; apoyos: Apoyo[] }[],
): { apoyos: Apoyo[]; avisos: string[] } {
  const conDatos = partes.filter((p) => p.apoyos.length > 0);
  const propios = conDatos.find((p) => p.serie.tipo === 'linea')?.apoyos ?? [];
  if (conDatos.length <= 1) return { apoyos: conDatos[0]?.apoyos ?? [], avisos: [] };

  const rangos = conDatos.map((p) => ({
    serie: p.serie,
    min: Math.min(...p.apoyos.map((a) => a.orden)),
    max: Math.max(...p.apoyos.map((a) => a.orden)),
  }));
  const choques: string[] = [];
  for (let a = 0; a < rangos.length; a += 1) {
    for (let b = a + 1; b < rangos.length; b += 1) {
      if (rangos[a].min <= rangos[b].max && rangos[b].min <= rangos[a].max) {
        choques.push(`${rangos[a].serie.codigo} y ${rangos[b].serie.codigo}`);
      }
    }
  }
  if (choques.length) {
    return {
      apoyos: propios,
      avisos: [
        `No se han juntado los puntos de ${choques.join(', ')}: su numeración de orden se pisa, y `
        + 'juntarlos daría vanos que no existen —la distancia entre dos puntos que en realidad no son '
        + 'vecinos—. Se enseñan solo los puntos propios de la línea. Hay que decidir en qué posición '
        + 'entra el tramo dentro de la línea antes de poder verlos juntos.',
      ],
    };
  }

  // Sin solapes, `orden` ordena de verdad. Se desempata por el orden en que
  // vinieron las series para que dos lecturas seguidas den la MISMA lista: una
  // ordenación inestable mueve puntos de sitio entre repintados.
  const marcados = conDatos.flatMap((p, iSerie) => p.apoyos.map((a, iPunto) => ({ a, iSerie, iPunto })));
  marcados.sort((x, y) => (x.a.orden - y.a.orden) || (x.iSerie - y.iSerie) || (x.iPunto - y.iPunto));

  // El mismo punto no sale dos veces aunque dos lecturas lo traigan: en pantalla
  // serían dos torres donde hay una, y entre ellas un vano de cero metros.
  const vistos = new Set<string>();
  const apoyos: Apoyo[] = [];
  for (const m of marcados) {
    if (vistos.has(m.a.id)) continue;
    vistos.add(m.a.id);
    apoyos.push(m.a);
  }
  return { apoyos, avisos: [] };
}

/** Por qué falló algo, en una frase, sin tragarse el motivo. */
function porQue(e: unknown): string {
  return e instanceof Error ? e.message : 'fallo desconocido';
}

/**
 * LEE LOS PUNTOS DE TODAS LAS SERIES DE UNA LÍNEA. Una consulta por serie.
 *
 * `pedir` es la consulta de verdad y llega desde fuera: así esta función —que
 * es la que decide— se puede probar contando llamadas, sin base de datos.
 *
 * ⚠️ LOS DOS FALLOS SE TRATAN DISTINTO A PROPÓSITO:
 *   · La serie PROPIA se pide sin red. Si falla, falla la línea entera, que es
 *     exactamente lo que pasaba ayer: nada cambia para las líneas de hoy.
 *   · Cada TRAMO se pide con red. Que una cuenta con alcance acotado no pueda
 *     leer el tramo —hueco conocido y documentado en las reglas— no puede
 *     tumbar la pantalla de una línea. Se declara qué faltó y la línea abre.
 *
 * ⚠️ Y HAY TRES RESULTADOS DISTINTOS, NO DOS. «El tramo trajo torres», «el
 * tramo no tiene NINGUNA torre registrada» y «no se pudieron MIRAR sus torres»
 * son estados distintos, y aplanar los dos últimos en el mismo convierte un
 * fallo de permisos en la afirmación de que el tramo está vacío (`32 · L-44`).
 * El tercero viaja en `noSePudoLeer`; el segundo, desde hoy, en los avisos —es
 * el estado normal de un tramo recién estrenado, del que solo hay recorrido
 * levantado, y decirlo evita que se lea como una avería.
 *
 * `libro` es el libro de códigos: con él, un tramo cuyo código y cuyo id no
 * cuadren NO se pide siquiera (`seriesAvaladas`). Es opcional porque hay
 * llamadores que no lo tienen; quien lee torres de verdad lo pasa.
 */
export async function apoyosDeLasSeries(
  series: SerieDeLinea[],
  pedir: (serie: SerieDeLinea) => Promise<Apoyo[]>,
  libro?: LibroDeCodigos,
): Promise<LecturaDeSeries> {
  // EL LIBRO, ANTES DE PEDIR NADA. Una serie que no cuadra no se consulta: se
  // ahorra la lectura y, sobre todo, no entra ni una torre ajena.
  const avalado = seriesAvaladas(series, libro);
  const avisos: string[] = [...avalado.avisos];
  const fallos: string[] = [];
  const partes: { serie: SerieDeLinea; apoyos: Apoyo[] }[] = [];

  for (const serie of avalado.series) {
    let leidos: Apoyo[];
    if (serie.tipo === 'linea') {
      leidos = await pedir(serie);
    } else {
      try {
        leidos = await pedir(serie);
      } catch (e) {
        fallos.push(`${serie.codigo}: ${porQue(e)}`);
        continue;
      }
    }
    const recorte = recorteDeSerie(leidos, serie);
    if (recorte.aviso) avisos.push(recorte.aviso);
    // LA CONSULTA FUE BIEN Y NO TRAJO NADA. Hasta hoy esto era indistinguible
    // de no haber preguntado: `apoyosDeLasSeries` solo declaraba hueco cuando
    // la consulta LANZABA. Se dice solo del TRAMO —de la línea propia ya lo
    // dice `faltan: ['torres']`— y no se repite si el recorte ya explicó por
    // qué se quedó en cero.
    if (serie.tipo === 'tramo' && !recorte.aviso && leidos.length === 0) {
      avisos.push(
        `El tramo compartido ${serie.codigo} no tiene todavía ninguna torre registrada a su nombre. `
        + 'La consulta se hizo y respondió: no es que no se hayan podido leer. Es el estado de un tramo '
        + 'recién estrenado, del que por ahora solo hay el recorrido levantado en campo.',
      );
    }
    partes.push({ serie, apoyos: recorte.apoyos });
  }

  const juntado = juntarSeries(partes);
  return {
    apoyos: juntado.apoyos,
    avisos: [...avisos, ...juntado.avisos],
    ...(fallos.length
      ? { noSePudoLeer: `No se pudieron leer las torres de ${fallos.join('; ')}` }
      : {}),
  };
}

/**
 * LOS RECORRIDOS LEVANTADOS, EL MÁS RECIENTE PRIMERO.
 *
 * Se ordena por la fecha de la JORNADA DE CAMPO, no por la de la carga: el
 * recorrido del 09-08 subido en septiembre sigue siendo del 09-08, y es esa
 * fecha la que envejece el dato y la que se rotula en pantalla. `fecha` es
 * `AAAA-MM-DD`, así que aquí el orden alfabético SÍ es el cronológico —y eso no
 * vale para `cargadoEn`, que es un instante con desplazamiento horario y solo
 * se usa para desempatar dos jornadas del mismo día.
 *
 * Se ordena en el NAVEGADOR y no en la consulta: el índice declarado para esta
 * colección es `(orgId, serieId)` y nada más. Pedir un orden que no tiene
 * índice funciona en el emulador y falla en producción (`35 · L-85`).
 */
export function ordenarLevantamientos(lista: Levantamiento[]): Levantamiento[] {
  return [...lista].sort((a, b) => String(b?.fecha ?? '').localeCompare(String(a?.fecha ?? ''))
    || (Date.parse(String(b?.cargadoEn ?? '')) || 0) - (Date.parse(String(a?.cargadoEn ?? '')) || 0));
}

/**
 * QUÉ LE FALTA A UNA LÍNEA PARA PODER CALCULAR.
 *
 * Los tres son datos que ENTREGA una persona, no que el sistema deduzca: el
 * conductor y las hipótesis los declara el Ingeniero cuando llega la ficha, y
 * las torres nacen cuando él declara la función de cada una. Ninguno se toma de
 * otra línea ni se supone (orden del Ingeniero, 2026-09-17): una línea a la que
 * le falta algo lo DICE, y eso es un estado válido, no una avería.
 *
 * El orden es fijo —conductor, hipótesis, torres— para que la pantalla los
 * enumere siempre igual y dos capturas del mismo día se puedan comparar.
 */
export type FaltaDeLinea = 'conductor' | 'hipotesis' | 'torres';

export function faltasDeLinea(
  que: { conductor?: unknown; hipotesis?: unknown; apoyos: number },
): FaltaDeLinea[] {
  const faltan: FaltaDeLinea[] = [];
  if (!que.conductor) faltan.push('conductor');
  if (!que.hipotesis) faltan.push('hipotesis');
  // Menos de dos puntos no es media línea: es ningún vano. El cálculo mecánico
  // vive entre dos estructuras, así que con 0 o 1 no hay nada que calcular —y
  // es el mismo umbral de siempre, solo que ahora se NOMBRA en vez de mandar la
  // línea a «vacío» y llevarse el parque por delante.
  if (que.apoyos < 2) faltan.push('torres');
  return faltan;
}

/** Lo que le falta a una línea, separado de lo que no se pudo mirar. */
export interface RevisionDeDatosDeLinea {
  /**
   * Lo que de verdad NO ESTÁ DECLARADO. Es lo único que la pantalla puede
   * enumerar como «falta declarar», porque es lo único de lo que consta que
   * nadie lo ha entregado todavía.
   */
  faltan: FaltaDeLinea[];
  /**
   * Lo que SÍ está declarado y no se pudo leer, con su motivo. No es una falta:
   * es un hueco de lectura, y decir «falta declarar las hipótesis» cuando lo
   * que pasó es que la base no las dejó leer es afirmar algo falso sobre la
   * línea — exactamente lo que prohíbe `32 · L-44`.
   */
  noSePudoLeer: { hipotesis?: string };
  /**
   * Si la línea puede seguir por el camino de siempre (fase «listo»).
   *
   * Es FALSO también cuando no falta nada pero algo declarado no se pudo leer:
   * calcular con unas hipótesis que no se pudieron traer es imposible, y
   * fingir que están sería peor que decirlo.
   */
  puedeCalcular: boolean;
}

/**
 * QUÉ LE FALTA A LA LÍNEA **Y** QUÉ NO SE PUDO MIRAR — las dos cosas, separadas.
 *
 * `faltasDeLinea` sigue existiendo y no cambia: responde a «¿qué no está?» con
 * lo que tenga en la mano. El problema es que quien la llamaba le pasaba las
 * hipótesis YA LEÍDAS, y una lectura fallida llega ahí como `null` — o sea,
 * indistinguible de «esta línea no declara hipótesis». La pantalla lo habría
 * enumerado como «falta declarar las hipótesis» cuando la línea las declara y
 * lo que falló fue la red, el permiso o el molde.
 *
 * Aquí se separan por origen, que es lo único que las distingue:
 *   · `hipotesisDeclarada` sale del DOCUMENTO de la línea (`hipotesisId`), y es
 *     lo que dice si alguien las entregó alguna vez.
 *   · `falloHipotesis` sale de la LECTURA, y es lo que dice por qué no están
 *     aquí ahora.
 */
export function faltasYHuecosDeLinea(
  que: {
    conductor?: unknown;
    /** ¿El documento de la línea declara unas hipótesis? (`hipotesisId`). */
    hipotesisDeclarada?: boolean;
    /** Las hipótesis ya leídas, si se pudieron leer. */
    hipotesis?: unknown;
    /** Por qué no se pudieron leer las que declara. */
    falloHipotesis?: string;
    apoyos: number;
  },
): RevisionDeDatosDeLinea {
  const declarada = que.hipotesisDeclarada ?? Boolean(que.hipotesis);
  const faltan: FaltaDeLinea[] = [];
  if (!que.conductor) faltan.push('conductor');
  // Solo es una FALTA si nadie las declaró. Declaradas y no leídas es un hueco.
  if (!declarada) faltan.push('hipotesis');
  if (que.apoyos < 2) faltan.push('torres');

  const ilegibles = declarada && !que.hipotesis;
  const noSePudoLeer = ilegibles
    ? {
      hipotesis: que.falloHipotesis
        ?? 'Las hipótesis de cálculo que esta línea declara no se pudieron leer, y no se dice por qué.',
    }
    : {};

  return { faltan, noSePudoLeer, puedeCalcular: faltan.length === 0 && !ilegibles };
}

/**
 * EL PARQUE, POR FECHA DE ALTA. **Se ordena AQUÍ, en el navegador.**
 *
 * ⚠️ NUNCA con un `orderBy` en la consulta, y no es una preferencia: un segundo
 * criterio en la consulta pide un índice compuesto que **el emulador no exige**
 * (`35 · L-85`) — las pruebas saldrían verdes y en producción el parque podría
 * quedarse vacío —, y además Firestore EXCLUYE de un `orderBy` los documentos
 * que no tienen ese campo: una línea sin `creadoEn` desaparecería en vez de
 * salir la última.
 *
 * Aquí no desaparece nadie: la que no traiga fecha legible va al final, y el
 * empate se rompe por código para que la lista no baile entre dos lecturas.
 *
 * Las fechas se comparan como INSTANTES, no como texto: `Instante` admite
 * desplazamiento horario (`+offset`), y «...T10:00:00-05:00» es posterior a
 * «...T14:00:00Z» aunque alfabéticamente vaya antes.
 */
export function ordenarParque(lineas: Linea[]): Linea[] {
  const cuando = (l: Linea): number => {
    const t = Date.parse(String(l?.creadoEn ?? ''));
    return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
  };
  return [...lineas].sort((a, b) => {
    const ta = cuando(a);
    const tb = cuando(b);
    // Se comparan con `<`, NUNCA restando: dos líneas sin fecha dan
    // `Infinity - Infinity`, que es `NaN`, y un comparador que devuelve `NaN`
    // deja el orden a merced del motor — o sea, distinto en cada navegador.
    if (ta !== tb) return ta < tb ? -1 : 1;
    return String(a?.codigo ?? '').localeCompare(String(b?.codigo ?? ''));
  });
}

/**
 * LAS LÍNEAS VECINAS: las OTRAS que declaran recorrer el mismo tramo.
 *
 * Sale de la lista del parque que ya está en memoria: **cero consultas nuevas y
 * ni un apoyo traído dos veces**. Las torres del tramo se leen UNA vez, con la
 * serie del tramo; lo que hace falta de la vecina es su documento de línea —sus
 * circuitos, su conductor, su hipótesis—, que ya se leyó al listar el parque.
 *
 * ⚠️ QUIEN NO ESTÉ EN EL PARQUE NO SALE AQUÍ, y hay que saberlo: `listarLineas`
 * deja fuera las inactivas y las que la sesión no alcanza. Una vecina invisible
 * haría contar UN circuito en una torre que lleva dos —o sea la mitad de la
 * carga, con veredicto «cumple» encima—. Por eso la defensa de verdad NO es
 * esta lista sino `Apoyo.circuitosTendidos`, que es un dato físico de la torre
 * y no depende de qué líneas estén dadas de alta.
 */
export interface LineaVecina {
  /** El tramo compartido por el que son vecinas. */
  tramoId: string;
  tramoCodigo: string;
  /** La otra línea que declara recorrerlo. */
  linea: Linea;
}

export function vecinasDeLinea(linea: Linea, parque: Linea[] | undefined): LineaVecina[] {
  const mios = seriesDeLinea(linea).filter((s) => s.tipo === 'tramo');
  if (!mios.length || !parque?.length) return [];
  const vecinas: LineaVecina[] = [];
  for (const tramo of mios) {
    for (const otra of parque) {
      if (!otra || otra.id === linea.id) continue;
      const recorre = seriesDeLinea(otra).some((s) => s.tipo === 'tramo' && s.id === tramo.id);
      if (recorre) vecinas.push({ tramoId: tramo.id, tramoCodigo: tramo.codigo, linea: otra });
    }
  }
  return vecinas;
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
  /**
   * LA LÍNEA QUE NO PUEDE CALCULAR TODAVÍA, Y DICE QUÉ LE FALTA (0.16.0).
   *
   * Es la fase de una línea recién dada de alta: existe, tiene su código y su
   * SCADA, y le faltan el conductor, las hipótesis y/o las torres — que llegan
   * DESPUÉS y de la mano del Ingeniero (orden del 2026-09-17).
   *
   * ⚠️ POR QUÉ ES UNA FASE Y NO UN ERROR. Hasta 0.15.0 una línea sin conductor
   * devolvía `{ fase: 'error' }` y una con menos de dos puntos, `{ fase:
   * 'vacio' }`: las dos **sustituyen la pantalla entera**, así que dar de alta
   * una línea incompleta se llevaba por delante el parque y con él el acceso a
   * LN-627. Aquí no: la línea abre, se ve el recorrido levantado si lo hay, y
   * las pestañas que no pueden calcular lo dicen con su motivo. Es el mismo
   * principio de siempre —declarar el hueco en vez de taparlo o de fingir una
   * avería— aplicado a la fase de arranque (`99 §ADR-029/032`).
   *
   * **No trae conductor ni hipótesis, ni siquiera nulos**: no hay ningún campo
   * donde colar los de otra línea. `faltan` dice cuáles de los tres faltan, en
   * orden fijo.
   */
  | { fase: 'recorrido'; linea: Linea; apoyos: Apoyo[]; evidencias: Evidencia[]; investigaciones: Investigacion[];
      /**
       * Qué le falta DECLARAR para poder calcular, en orden fijo.
       *
       * ⚠️ PUEDE VENIR VACÍO, y entonces significa algo muy concreto: no falta
       * nada, pero algo que la línea SÍ declara no se pudo leer y viaja en
       * `noSePudoLeer` con su motivo. Enumerar eso como «falta declarar» sería
       * afirmar algo falso sobre la línea (`32 · L-44`): la pantalla enseña las
       * dos listas, y la de lectura dice «no se pudo mirar», no «no está».
       */
      faltan: FaltaDeLinea[];
      /** Lo levantado en campo y AÚN NO registrado como torres. Puede venir vacío. */
      levantamientos: Levantamiento[];
      /**
       * Otras líneas que recorren el mismo tramo compartido.
       *
       * Opcional por lo mismo que `lineas`: quien las sabe es el PUENTE, que
       * tiene el parque en la mano (`enlace.ts`), no el lector de una línea
       * suelta —que tendría que volver a leer el parque entero para
       * averiguarlo—. Ausente significa «no consta», nunca «no hay ninguna».
       */
      vecinas?: LineaVecina[];
      lineas?: Linea[];
      avisoRuta?: string;
      /** Lo que se decidió no juntar de las series, y por qué. */
      avisosDeSeries?: string[];
      noSePudoLeer?: { investigaciones?: string; evidencias?: string; torres?: string; levantamientos?: string; hipotesis?: string } }
  | { fase: 'listo'; linea: Linea; apoyos: Apoyo[]; conductor: Conductor; hipotesis: Hipotesis; investigaciones: Investigacion[]; evidencias: Evidencia[]; lineas?: Linea[];
      /**
       * Lo levantado en campo que todavía no es torre. Una línea COMPLETA
       * también puede tener levantamientos —el recorrido del día que se fue a
       * campo— y verlos al lado de las torres registradas es como se comprueba
       * que no falta ninguna.
       */
      levantamientos?: Levantamiento[];
      /** Otras líneas que recorren su mismo tramo compartido. */
      vecinas?: LineaVecina[];
      /** Lo que se decidió no juntar de las series, y por qué. */
      avisosDeSeries?: string[];
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
      noSePudoLeer?: { investigaciones?: string; evidencias?: string; torres?: string; levantamientos?: string } }
  /**
   * La ÚNICA pantalla que se interpone antes de entrar. Es una fase del mismo
   * almacén y no una ruta: no hay «detrás» al que saltar porque los datos de la
   * línea **no se llegan a pedir**.
   */
  | { fase: 'cambiar_contrasena'; correo: string }
  | { fase: 'error'; mensaje: string };

// ════════════════════════════════════════════════════════════════════════════
// LO QUE LA PANTALLA TENDRÁ QUE PINTAR — preparado aquí, todavía sin usar
// ----------------------------------------------------------------------------
// ⚠️ ESTO NO LO LLAMA NADIE TODAVÍA, y es deliberado: las pantallas de esta
// tanda no se tocan (la fase «recorrido» aún no tiene su `case` en `App.tsx`).
// Se deja escrito y probado aquí para que la tanda que haga la vista solo tenga
// que PINTAR una lista, en vez de volver a decidir qué se enseña y con qué
// palabras — que es como acaban existiendo dos criterios distintos para lo
// mismo en dos componentes.
//
// EL DAÑO QUE CIERRA, medido por los revisores: `avisosDeSeries` y
// `noSePudoLeer.torres` YA VIAJAN con el dato y **no los lee nadie**. Una
// cuenta cuyo alcance no llegue al tramo abriría una línea completa, dibujaría
// y calcularía con la mitad de sus torres y no lo diría. Ese es el fallo más
// caro del proyecto: un número firmado de menos, en silencio.
// ════════════════════════════════════════════════════════════════════════════

/** Un aviso listo para enseñar: de qué clase es, de qué habla y qué dice. */
export interface AvisoDeDatos {
  /**
   * `serie`: algo que se decidió NO juntar (un tramo que no cuadra con el
   * libro, dos numeraciones que se pisan, un tramo sin torres registradas).
   * `lectura`: algo que no se pudo MIRAR. La distinción es la que lleva todo
   * este módulo: «no hay» y «no se pudo comprobar» no se pueden enseñar igual.
   */
  clase: 'serie' | 'lectura';
  /** De qué se habla, ya en castellano: «las torres», «las hipótesis de cálculo»… */
  de?: string;
  texto: string;
}

/** Cómo se nombra cada hueco en pantalla, y en qué orden se enumeran. */
const HUECOS_EN_ORDEN: [clave: string, rotulo: string][] = [
  ['torres', 'las torres'],
  ['hipotesis', 'las hipótesis de cálculo'],
  ['levantamientos', 'los recorridos levantados'],
  ['evidencias', 'las fichas de fotos'],
  ['investigaciones', 'los expedientes de falla'],
];

/**
 * TODO LO QUE HAY QUE ADVERTIR DE UN ESTADO, en una sola lista y en orden fijo.
 *
 * El orden es fijo por lo mismo que el de `faltan`: para que dos capturas del
 * mismo día se puedan comparar y para que un aviso no cambie de sitio entre dos
 * repintados. Primero lo de las series —lo que se decidió no juntar— y después
 * lo que no se pudo leer, de lo más caro a lo más accesorio.
 *
 * Es PURA y no sabe de pantallas: devuelve frases, no componentes.
 */
export function avisosDeDatos(estado: EstadoDatos): AvisoDeDatos[] {
  if (estado.fase !== 'recorrido' && estado.fase !== 'listo') return [];
  const salida: AvisoDeDatos[] = [];
  for (const texto of estado.avisosDeSeries ?? []) salida.push({ clase: 'serie', texto });
  const hueco = (estado.noSePudoLeer ?? {}) as Record<string, string | undefined>;
  for (const [clave, rotulo] of HUECOS_EN_ORDEN) {
    const motivo = hueco[clave];
    if (motivo) salida.push({ clase: 'lectura', de: rotulo, texto: `No se pudieron leer ${rotulo}: ${motivo}` });
  }
  return salida;
}

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
  /**
   * Líneas que el usuario autenticado tiene permiso de ver, **ya ordenadas por
   * fecha de alta** (`ordenarParque`): la más antigua primero. Es lo que hace
   * que entrar sin enlace abra la línea de siempre y no la que el azar de los
   * identificadores ponga delante.
   */
  listarLineas(): Promise<Linea[]>;
  cargarLinea(lineaId: string): Promise<EstadoDatos>;

  /**
   * LO LEVANTADO EN CAMPO DE UNAS SERIES —una línea, un tramo compartido— que
   * todavía NO es una torre.
   *
   * Es la prueba fechada de que alguien recorrió ese trazado y apuntó unos
   * puntos, no una lista de apoyos: el molde prohíbe con nombre y apellido la
   * función estructural, el orden y el nombre canónico
   * (`contratos/src/levantamiento.ts`). Sirve para ENSEÑAR el recorrido de una
   * línea que aún no tiene torres; con él no se calcula nada.
   *
   * Nunca lanza: un fallo aquí no puede impedir abrir la línea. Lo que no se
   * pudo leer se cuenta aparte, no se convierte en «no hay ninguno».
   */
  listarLevantamientos(serieIds: string[]): Promise<Levantamiento[]>;
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
  listarAuditoria(filtro?: FiltroDeAuditoria): Promise<PaginaDeAuditoria>;

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
   * DA DE ALTA UNA LÍNEA NUEVA. Escribe UN documento y nada más: ni una torre,
   * ni un conductor, ni una hipótesis.
   *
   * El documento llega ya armado por la pantalla del alta —que es donde el
   * Ingeniero ve, campo a campo, exactamente lo que se va a escribir— y esta
   * capa no inventa ninguno de sus valores. Lo único que pone de su parte son
   * los tres que no se le pueden creer a una pantalla: `orgId` y `creadoPor`
   * salen de la SESIÓN abierta (`firestore.rules §altaCoherente` exige que el
   * autor sea exactamente quien escribe), y la firma de cada tramo compartido
   * declarado —quién lo declaró y cuándo— se sella igual, por lo mismo que la
   * ficha estructural: un sello dice quién responde de ese dato el día que se
   * firme un informe.
   *
   * ⚠️ NO SE PUEDE DESHACER: `firestore.rules` niega `delete` sobre líneas. Y no
   * basta con no borrar — quien tiene `lineas.editar` puede ACTUALIZAR, así que
   * un segundo alta del mismo código pisaría la línea que ya está. Por eso se
   * mira con un `getDoc` ANTES de escribir y, si ya estaba, no se escribe nada y
   * se dice (`yaEstaba`).
   *
   * LANZA con un mensaje legible cuando el alta entera no procede: sin sesión,
   * sin `lineas.editar`, sin organización en el token, sin alcance sobre esa
   * línea, o con un documento que el molde rechaza. Lanza ANTES de mandar nada.
   */
  crearLinea(documento: Record<string, unknown>): Promise<AcuseDeLineaNueva>;

  /**
   * GUARDA EL RECORRIDO TAL CUAL LO TRAJO EL GPS, sin convertirlo en torres.
   *
   * Es un HECHO FECHADO —una jornada, un archivo, unos puntos— y por eso
   * `firestore.rules` solo deja mover su nota después: los puntos no se
   * reescriben nunca. Lo que aquí se guarda no calcula nada; sirve para poder
   * enseñar el recorrido de una línea que todavía no tiene torres, y para que el
   * día que se registren caigan donde corresponde.
   *
   * ⚠️ LA NOTA DE CADA PUNTO SE ESCRIBE AQUÍ O NO SE ESCRIBE NUNCA. La regla
   * congela `puntos`, así que «la R es anotación mía, la placa dice E16» solo
   * cabe en el momento de cargar. La pantalla tiene que pedirla antes.
   *
   * Como el identificador se deriva de la fecha y de la huella del archivo,
   * cargar dos veces el mismo GPX cae sobre el mismo documento: se comprueba con
   * un `getDoc` ANTES y se devuelve `yaEstaba` en vez de reintentar una
   * escritura que la regla va a negar con un mensaje ilegible.
   *
   * LANZA, igual que el alta de la línea, cuando la operación entera no procede.
   */
  guardarLevantamiento(documento: Record<string, unknown>): Promise<AcuseDeLevantamiento>;

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
  async listarLevantamientos() {
    // Sin sesión no se lee nada, y una lista vacía es la respuesta correcta:
    // quien la reciba ya sabe por la fase que no hay sesión, así que no puede
    // confundirla con «esta serie no tiene ningún recorrido levantado».
    return [];
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
    return { filas: [], cursor: null };
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
  async crearLinea(): Promise<never> {
    // Un acuse vacío se leería como «se dio de alta y no hay nada que contar».
    throw new Error('No hay ninguna sesión abierta: no se puede dar de alta ninguna línea.');
  },
  async guardarLevantamiento(): Promise<never> {
    throw new Error('No hay ninguna sesión abierta: no se puede guardar ningún recorrido levantado.');
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
