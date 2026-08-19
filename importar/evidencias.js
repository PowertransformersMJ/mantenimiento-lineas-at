// ============================================================================
// importar/evidencias.js — de qué APOYO cuelga cada foto, y por qué
// ----------------------------------------------------------------------------
// Módulo PURO: sin DOM, sin red, sin módulos nativos, sin credenciales. Corre
// igual en las pruebas de Node, en el guion de consola y dentro del navegador.
// Ésa es toda su razón de ser: hay DOS lectores —`herramientas/subir-evidencias.mjs`
// y la pestaña «Fotos»— y UNA sola implementación. Dos copias del emparejador
// solo coinciden mientras nadie toque ninguna, y su desacuerdo no rompe nada
// visible: deja fotos colgadas del apoyo vecino, creíbles y mal.
//
// LA REGLA, en una frase:
//
//     La foto se cuelga del apoyo cuyo `nombreNormalizado` es EXACTAMENTE el
//     nombre canónico que su CARPETA declara en el mapa. Nunca por posición,
//     nunca recalculando el identificador.
//
// LA CADENA, y ningún eslabón es una posición:
//
//     archivo → (índice del registro) → CARPETA → (mapa de carpetas) →
//     NOMBRE CANÓNICO → (casado EXACTO contra `nombreNormalizado` del apoyo que
//     YA está en la base) → se copia SU `id` tal cual.
//
// POR QUÉ EXISTE. Hasta ADR-029 la asignación se resolvía por POSICIÓN: el
// número de punto del levantamiento menos uno, buscado en el índice de apoyos.
// Es el mismo pecado que ya se corrigió para la identidad de los apoyos
// (§ADR-027): atar algo permanente a una posición que se mueve. Y la posición
// se mueve de verdad: el 17-08 entró un empalme intercalado con orden 2,5 y un
// pórtico con orden 26, así que la serie ya no es 0…25 corrida.
//
// LAS PARADAS. Si algo no casa se PARA y se dice; nunca se adivina y nunca se
// sube «lo que se pueda» (todo-o-nada). Una foto colgada del apoyo equivocado
// se lee como evidencia de algo que no ocurrió ahí: es PEOR que una foto
// ausente, porque nadie la audita. Y no se puede quitar: `firestore.rules`
// niega `delete` sobre evidencias.
//
// ⚠️ AQUÍ NO ENTRA NI UN BYTE DE CLIENTE. Este archivo vive en el repositorio
// PÚBLICO: no contiene nombres de carpeta reales, ni nombres de archivo, ni
// coordenadas, ni el nombre de ninguna instalación. El mapa de carpetas —que sí
// los lleva— vive en la bóveda y se le PASA a estas funciones como argumento.
// ============================================================================

/**
 * Formatos que el sistema sabe servir. Es una lista blanca a propósito: un
 * formato que no esté aquí es una PARADA, no un archivo a ignorar.
 *
 * HEIC NO ESTÁ, y no es un olvido: ni el molde de los datos lo admite
 * (`contratos/`), ni Chrome en Windows lo dibuja. Un HEIC subido daría una
 * ficha válida apuntando a un objeto que la pantalla no puede pintar. Se
 * convierte a JPG ANTES, en la bóveda.
 */
export const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

/** Nombres que el extractor de la bóveda le da a su índice. No son fotos. */
export const NOMBRES_INDICE = ['indice.json', 'pies.json'];

/** Tope de tamaño por archivo, en bytes. El mismo que exige el portero. */
export const TOPE_BYTES = 25 * 1024 * 1024;

export const extensionDe = (archivo) => {
  const i = String(archivo).lastIndexOf('.');
  return i > 0 ? String(archivo).slice(i).toLowerCase() : '';
};

/**
 * La clave del objeto en el depósito. La LLEVA la huella, y por dos motivos:
 * dos ficheros distintos nunca se pisan, y el mismo fichero subido dos veces
 * cae en la misma clave — idempotencia gratis. El portero exige exactamente
 * esta forma antes de escribir un solo byte.
 */
export const claveDeObjeto = (codigoLinea, origen, sha256, archivo) =>
  `${codigoLinea}/${origen}/${String(sha256).slice(0, 12)}-${archivo}`;

/**
 * La MISMA forma, escrita como expresión, para que el portero pueda exigirla y
 * para que una prueba pueda comprobar que las dos no divergen.
 *
 * Sin espacios en blanco de control, sin `..`, sin rutas libres: exactamente
 * tres tramos y una extensión de la lista blanca.
 */
export const FORMA_DE_CLAVE =
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}\/[A-Za-z0-9][A-Za-z0-9._-]{0,63}\/[0-9a-f]{12}-[^/\\]{1,180}\.(jpg|jpeg|png|webp|pdf)$/;

/**
 * Separa los archivos que se saben servir de los que no.
 *
 * EL FALLO QUE ESTO CIERRA. El filtro anterior era un `.filter()` sobre la
 * tabla de MIME: lo que no reconocía, DESAPARECÍA. Sin un solo aviso. Con un
 * registro fotográfico hecho con teléfono —donde la inmensa mayoría de los
 * archivos son HEIC— eso significa subir un puñado de fotos, imprimir un
 * «listo» en verde, y que el resto no exista para nadie. El silencio era el
 * fallo, no el formato.
 *
 * @param {string[]} archivos
 * @param {{ignorar?: string[]}} opciones
 * @returns {{aceptados: {archivo: string, mime: string}[], desconocidos: string[]}}
 */
export function clasificarArchivos(archivos, opciones = {}) {
  const ignorar = new Set(opciones.ignorar ?? NOMBRES_INDICE);
  const aceptados = [];
  const desconocidos = [];
  for (const archivo of archivos ?? []) {
    if (ignorar.has(archivo)) continue;
    const mime = MIME[extensionDe(archivo)];
    if (mime) aceptados.push({ archivo, mime });
    else desconocidos.push(archivo);
  }
  return { aceptados, desconocidos };
}

/** Las filas del mapa, venga como array suelto o como el objeto con notas. */
export const filasDelMapa = (mapa) =>
  Array.isArray(mapa) ? mapa : (Array.isArray(mapa?.carpetas) ? mapa.carpetas : []);

/**
 * Aplica el mapa declarado a mano: de nombre de CARPETA a nombre CANÓNICO.
 *
 * El mapa es una tabla escrita a mano, no una expresión regular, y esa es una
 * decisión, no una pereza al revés. El desfase que esto viene a matar no nació
 * de un error de cálculo: nació de leer una ETIQUETA como si fuera una
 * identidad. Una regla sobre la forma del nombre de una carpeta hecha en un
 * teléfono es exactamente ese mismo gesto escrito otra vez.
 *
 * ⚠️ LAS FILAS SALEN EN EL ORDEN DEL MAPA, no en el orden del disco. Ese orden
 * es el del RECORRIDO y es lo único contra lo que tiene sentido comprobar la
 * secuencia: el orden en que aparecen los archivos de una carpeta plana no
 * significa absolutamente nada.
 *
 * @param {object|Array} mapa
 * @param {string[]} carpetas  las que hay de verdad
 * @returns {{filas: {carpeta,nombreCanonico,yaCargado}[], problemas: object[]}}
 */
export function resolverCarpetas(mapa, carpetas) {
  const problemas = [];
  const porCarpeta = new Map();

  for (const fila of filasDelMapa(mapa)) {
    if (typeof fila?.carpeta !== 'string' || !fila.carpeta) {
      problemas.push({ clase: 'fila-sin-carpeta' });
      continue;
    }
    if (typeof fila?.nombreCanonico !== 'string' || !fila.nombreCanonico) {
      problemas.push({ clase: 'fila-sin-canonico', carpeta: fila.carpeta });
      continue;
    }
    if (porCarpeta.has(fila.carpeta)) {
      problemas.push({ clase: 'carpeta-declarada-dos-veces', carpeta: fila.carpeta });
      continue;
    }
    porCarpeta.set(fila.carpeta, fila);
  }

  // Dos carpetas apuntando al mismo canónico serían dos sitios peleándose por
  // la misma ficha. Se caza en el mapa, antes de tocar un solo archivo.
  const porCanonico = new Map();
  for (const fila of porCarpeta.values()) {
    const previa = porCanonico.get(fila.nombreCanonico);
    if (previa) {
      problemas.push({
        clase: 'canonico-repetido',
        nombreCanonico: fila.nombreCanonico,
        carpetas: [previa.carpeta, fila.carpeta],
      });
    } else porCanonico.set(fila.nombreCanonico, fila);
  }

  const presentes = new Set(carpetas ?? []);
  for (const carpeta of presentes) {
    if (!porCarpeta.has(carpeta)) problemas.push({ clase: 'carpeta-no-declarada', carpeta });
  }

  // En ORDEN DEL MAPA, y solo las que de verdad traen archivos.
  const filas = [];
  for (const fila of porCarpeta.values()) {
    if (!presentes.size || presentes.has(fila.carpeta)) {
      filas.push({
        carpeta: fila.carpeta,
        nombreCanonico: fila.nombreCanonico,
        yaCargado: fila.yaCargado === true,
      });
    }
  }
  return { filas, problemas };
}

/**
 * A QUÉ APOYO va cada foto. El corazón del emparejador.
 *
 * ⚠️ `opciones.ordenDeclarado` NO es opcional, y su ausencia es una PARADA. Es
 * la lista de nombres canónicos en el orden en que el Ingeniero los escribió en
 * el mapa —el orden del recorrido—, y sin ella el control anti-transposición no
 * puede hacerse. Que un control se apague solo porque a alguien se le olvidó un
 * argumento es exactamente el fallo del `--origen` mal escrito: falla ABIERTO.
 * Aquí falla cerrado.
 *
 * @param {{archivo:string,nombreCanonico?:string,carpeta?:string,sha256?:string}[]} fotos
 * @param {{id:string,nombreNormalizado?:string,orden?:number,tipoPunto?:string,nombreCampo?:string}[]} apoyos
 * @param {{ordenDeclarado?: string[], huellasEnLaBase?: string[]}} opciones
 */
export function repartirEvidencias(fotos, apoyos, opciones = {}) {
  const problemas = [];
  const huellas = new Set(opciones.huellasEnLaBase ?? []);

  // ── El índice de apoyos, por NOMBRE ──────────────────────────────────────
  // ⚠️ Se guarda el documento ENTERO para usar SU `id` tal cual. No se
  // re-deriva con la fórmula del sembrador: copiar la fórmula haría que el día
  // que el sembrador cambie de semilla, las fotos apunten a documentos
  // inexistentes, sin un solo error visible.
  const porNombre = new Map();
  for (const apoyo of apoyos ?? []) {
    const nombre = apoyo?.nombreNormalizado;
    if (typeof nombre !== 'string' || !nombre) {
      problemas.push({ clase: 'apoyo-sin-nombre', apoyoId: apoyo?.id ?? null });
      continue;
    }
    if (porNombre.has(nombre)) {
      problemas.push({ clase: 'apoyo-repetido', nombreCanonico: nombre });
      continue;
    }
    porNombre.set(nombre, apoyo);
  }
  if (!porNombre.size) problemas.push({ clase: 'base-sin-apoyos' });

  // ── Cada foto a su apoyo ─────────────────────────────────────────────────
  const asignaciones = [];
  for (const foto of fotos ?? []) {
    const nombre = foto?.nombreCanonico;
    if (typeof nombre !== 'string' || !nombre) {
      problemas.push({ clase: 'foto-sin-canonico', archivo: foto?.archivo ?? null, carpeta: foto?.carpeta ?? null });
      continue;
    }
    const apoyo = porNombre.get(nombre);
    if (!apoyo) {
      problemas.push({ clase: 'canonico-sin-apoyo', archivo: foto?.archivo ?? null, carpeta: foto?.carpeta ?? null, nombreCanonico: nombre });
      continue;
    }
    asignaciones.push({
      ...foto,
      nombreCanonico: nombre,
      apoyoId: apoyo.id,
      apoyoOrden: apoyo.orden,
      apoyoCampo: apoyo.nombreCampo ?? apoyo.nombreNormalizado,
      // Un empalme NO es un apoyo: puede estar a mitad de vano y no sostener
      // nada. Se marca para que la tabla lo diga y nadie lo lea como estructura.
      esEmpalme: (apoyo.tipoPunto ?? 'Estructura') === 'Empalme',
      // LO QUE DECIDE si una foto entra: su HUELLA contra las fichas que ya
      // están en la base. Nunca una casilla que alguien tecleó en el mapa.
      yaEnLaBase: typeof foto?.sha256 === 'string' && huellas.has(foto.sha256),
    });
  }

  // ── Los grupos, en el orden DECLARADO ────────────────────────────────────
  const declarado = Array.isArray(opciones.ordenDeclarado) ? opciones.ordenDeclarado : null;
  if (!declarado) problemas.push({ clase: 'orden-no-declarado' });

  const porGrupo = new Map();
  for (const a of asignaciones) {
    let g = porGrupo.get(a.nombreCanonico);
    if (!g) {
      g = {
        nombreCanonico: a.nombreCanonico,
        carpetas: new Set(),
        apoyoId: a.apoyoId,
        apoyoOrden: a.apoyoOrden,
        apoyoCampo: a.apoyoCampo,
        esEmpalme: a.esEmpalme,
        fotos: 0, nuevas: 0, yaEstan: 0,
      };
      porGrupo.set(a.nombreCanonico, g);
    }
    if (a.carpeta) g.carpetas.add(a.carpeta);
    g.fotos += 1;
    if (a.yaEnLaBase) g.yaEstan += 1; else g.nuevas += 1;
  }

  // El orden de la tabla es el del MAPA. Lo que el mapa no nombre va detrás,
  // porque una fila sin sitio declarado no puede colarse en medio del recorrido.
  const orden = new Map((declarado ?? []).map((n, i) => [n, i]));
  const grupos = [...porGrupo.values()].sort(
    (a, b) => (orden.get(a.nombreCanonico) ?? 1e9) - (orden.get(b.nombreCanonico) ?? 1e9),
  );

  for (const g of grupos) {
    // Dos carpetas distintas alimentando el mismo apoyo: o el mapa está mal, o
    // alguien juntó dos sitios. En los dos casos se para.
    if (g.carpetas.size > 1) {
      problemas.push({ clase: 'canonico-repetido', nombreCanonico: g.nombreCanonico, carpetas: [...g.carpetas] });
    }
    g.carpeta = [...g.carpetas][0] ?? null;
    g.carpetas = [...g.carpetas];
  }

  // ── El cierre contra transposiciones ─────────────────────────────────────
  //
  // Recorridas las FILAS DEL MAPA en el orden en que él las escribió —que es el
  // orden del recorrido—, el `orden` de los apoyos resueltos tiene que salir
  // ESTRICTAMENTE creciente. Si alguien cruzó dos filas del mapa, el nombre casa
  // y el apoyo existe: sólo la secuencia delata.
  //
  // ⚠️ ANTES ESTO MIRABA EL ORDEN EN QUE APARECÍAN LOS ARCHIVOS, y por eso
  // saltaba con la corrida BUENA: las fotos de un registro van ordenadas por
  // NOMBRE DE ARCHIVO en una carpeta plana, no por recorrido. Un guardián que
  // grita cuando todo está bien se acaba apagando, y entonces no guarda nada.
  if (declarado) {
    let previo = null;
    for (const nombre of declarado) {
      const g = porGrupo.get(nombre);
      if (!g || !Number.isFinite(g.apoyoOrden)) continue;
      if (previo && g.apoyoOrden <= previo.apoyoOrden) {
        problemas.push({
          clase: 'secuencia-rota',
          anterior: previo.nombreCanonico, ordenAnterior: previo.apoyoOrden,
          siguiente: g.nombreCanonico, ordenSiguiente: g.apoyoOrden,
        });
      }
      previo = g;
    }
  }

  const resumen = {
    fotos: asignaciones.length,
    puntos: grupos.length,
    nuevas: asignaciones.filter((a) => !a.yaEnLaBase).length,
    yaEstan: asignaciones.filter((a) => a.yaEnLaBase).length,
    enEmpalmes: asignaciones.filter((a) => a.esEmpalme).length,
  };

  return { asignaciones, grupos, problemas, resumen };
}

/**
 * LA CADENA ENTERA, de una sola llamada. Es la función que los DOS lectores
 * usan, y existe exactamente por el fallo que la precedió: `resolverCarpetas`
 * estaba escrito y probado, y no lo llamaba NADIE — el guion leía del índice un
 * campo `nombreCanonico` que el índice no tiene, y abortaba con un problema por
 * cada archivo, siempre, en la primera corrida.
 *
 * Un eslabón suelto que nadie enlaza no es media solución: es cero.
 *
 * @param {object} entrada
 * @param {object|Array} entrada.mapa       el mapa de carpetas (de la bóveda)
 * @param {{archivo:string,carpeta?:string,sha256?:string,bytes?:number}[]} entrada.entradas
 * @param {object[]} entrada.apoyos          los apoyos leídos de la base
 * @param {string[]} [entrada.huellasEnLaBase]  sha256 de las fichas que ya existen
 * @param {string} [entrada.codigoLinea]
 * @param {string} [entrada.origen]
 */
export function prepararReparto({
  mapa, entradas, apoyos, huellasEnLaBase = [], codigoLinea = '', origen = '',
}) {
  const lista = entradas ?? [];
  const { aceptados, desconocidos } = clasificarArchivos(lista.map((e) => e.archivo));
  const problemas = desconocidos.map((archivo) => ({ clase: 'extension-desconocida', archivo }));

  const carpetas = [...new Set(lista.map((e) => e.carpeta).filter((c) => typeof c === 'string' && c))];
  if (carpetas.length !== new Set(lista.map((e) => e.carpeta)).size) {
    // Hay al menos una entrada sin carpeta. Se dice por su nombre, una por una.
    for (const e of lista) {
      if (typeof e.carpeta !== 'string' || !e.carpeta) {
        problemas.push({ clase: 'archivo-sin-carpeta', archivo: e.archivo });
      }
    }
  }

  const { filas, problemas: pMapa } = resolverCarpetas(mapa, carpetas);
  problemas.push(...pMapa);

  const canonicoDe = new Map(filas.map((f) => [f.carpeta, f.nombreCanonico]));
  const mimeDe = new Map(aceptados.map((a) => [a.archivo, a.mime]));

  const fotos = lista
    .filter((e) => mimeDe.has(e.archivo))
    .map((e) => ({
      ...e,
      mime: mimeDe.get(e.archivo),
      nombreCanonico: canonicoDe.get(e.carpeta),
      clave: e.sha256 ? claveDeObjeto(codigoLinea, origen, e.sha256, e.archivo) : undefined,
    }));

  // Una carpeta que no está en el mapa ya produjo su parada arriba; sus fotos
  // no se vuelven a acusar una por una, que sería 40 líneas del mismo error.
  const sinCanonico = new Set(fotos.filter((f) => !f.nombreCanonico).map((f) => f.carpeta));
  const utiles = fotos.filter((f) => f.nombreCanonico);

  const reparto = repartirEvidencias(utiles, apoyos, {
    ordenDeclarado: filas.map((f) => f.nombreCanonico),
    huellasEnLaBase,
  });

  return {
    ...reparto,
    filas,
    problemas: [...problemas, ...reparto.problemas],
    carpetasSinDestino: [...sinCanonico],
  };
}

/** Un problema, dicho en el idioma del Ingeniero. Sin jerga y sin culpar al usuario. */
export function describirProblema(p) {
  switch (p.clase) {
    case 'extension-desconocida':
      return `«${p.archivo}»: formato que este sistema no sabe mostrar. Conviértalo a JPG antes; descartarlo en silencio es lo que dejaba fotos fuera sin avisar.`;
    case 'archivo-sin-carpeta':
      return `«${p.archivo}» no dice de qué carpeta salió. Sin carpeta no hay punto, y adivinarlo es justo lo que este sistema no va a hacer.`;
    case 'carpeta-no-declarada':
      return `la carpeta «${p.carpeta}» no tiene nombre declarado en el mapa. Declárelo o quítela: adivinarlo es justo lo que produjo el desfase anterior.`;
    case 'carpeta-declarada-dos-veces':
      return `la carpeta «${p.carpeta}» está declarada dos veces en el mapa, con destinos distintos.`;
    case 'fila-sin-carpeta':
      return 'hay una fila del mapa que no dice a qué carpeta se refiere.';
    case 'fila-sin-canonico':
      return `la fila «${p.carpeta}» del mapa no dice a qué punto va.`;
    case 'canonico-repetido':
      return `dos sitios (${(p.carpetas ?? []).join(' y ')}) apuntan al mismo punto «${p.nombreCanonico}»: se pelearían por la misma ficha.`;
    case 'canonico-sin-apoyo':
      return `«${p.nombreCanonico}» no está cargado en la base. Cárguelo antes de subirle fotos; una foto colgada de un punto inexistente no la ve nadie.`;
    case 'foto-sin-canonico':
      return `${p.archivo ?? 'un archivo'} no dice a qué punto pertenece. Sin eso no hay asignación posible.`;
    case 'apoyo-repetido':
      return `en la base hay dos puntos con el nombre «${p.nombreCanonico}». Hasta resolver cuál es cuál no se sube nada.`;
    case 'apoyo-sin-nombre':
      return 'hay un punto en la base sin nombre normalizado: no se puede emparejar por nombre.';
    case 'base-sin-apoyos':
      return 'no hay puntos de esta línea en la base. Cárguelos antes de subirles fotos.';
    case 'orden-no-declarado':
      return 'no se recibió el orden del recorrido, así que no se pudo comprobar que dos filas del mapa no estén cruzadas. No se sube nada sin ese control.';
    case 'secuencia-rota':
      return `la secuencia va hacia atrás: «${p.anterior}» (posición ${p.ordenAnterior}) va antes que «${p.siguiente}» (posición ${p.ordenSiguiente}). Parece que dos filas del mapa están cruzadas.`;
    default:
      return `problema no clasificado: ${JSON.stringify(p)}`;
  }
}
