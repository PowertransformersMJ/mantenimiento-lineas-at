// ============================================================================
// vistas/fotosNuevas.ts — lo que la pestaña «Fotos» necesita SABER
// ----------------------------------------------------------------------------
// Espejo de `vistas/puntosNuevos.ts`, para el otro acto irreversible de este
// sistema. Aquí no hay React, no hay DOM y no hay red: entra el reparto que
// devuelve `@lineas/importar/evidencias` y salen las frases, las cifras y las
// faltas que la pantalla pinta. Todo esto se prueba en Node.
//
// POR QUÉ VIVE FUERA DEL COMPONENTE. Si el «205 fotos en 28 puntos · 106
// entrarían nuevas» de esta pantalla tuviera su propia aritmética, el día que
// discrepara del reparto que de verdad se manda nadie sabría cuál mirar — y el
// número que él lee ANTES de firmar es la única defensa que hay contra colgar
// una foto del apoyo equivocado, porque las reglas de la base prohíben borrarla.
//
// ⚠️ NI UN DATO DE CLIENTE. Las frases están escritas con huecos; los nombres
// reales llegan del mapa de la bóveda, en tiempo de ejecución.
// ============================================================================

/** Una fila de la tabla de reparto: una carpeta, un punto, un estado. */
export interface FilaDeReparto {
  /** De dónde salió: el nombre de la carpeta, tal cual está en el disco. */
  carpeta: string;
  /** A qué punto va. Es lo único que él puede cambiar en esta pantalla. */
  nombreCanonico: string;
  /** Cómo se llama ese punto en el aparato. Va para que lo reconozca. */
  nombreCampo: string;
  fotos: number;
  nuevas: number;
  yaEstan: number;
  esEmpalme: boolean;
  /** Lo que se pinta en la columna Estado. Nunca dos cosas a la vez. */
  estado: 'entra nueva' | 'ya está' | 'nada que subir';
}

/** Lo que quedó fuera y por qué, contado por punto. */
export interface FueraDeLaSubida {
  punto: string;
  archivo: string;
  motivo: string;
}

/** El acuse de una subida, ya contado. */
export interface ActaDeFotos {
  intentadas: number;
  entraron: number;
  yaEstaban: number;
  porPunto: { punto: string; entraron: number; yaEstaban: number; fallaron: number }[];
  fuera: FueraDeLaSubida[];
  cuando: string;
  quien: string;
  linea: string;
}

/** Las frases literales de la pantalla. Viven aquí para poder probarlas. */
export const TEXTOS = {
  nadaSale:
    'Los archivos se leen en su equipo. Nada sale de aquí hasta que usted lo diga.',
  sinIndice:
    'En esa carpeta no está el índice del registro. Sin él no se sabe de qué punto es cada foto, '
    + 'y adivinarlo es justo lo que este sistema no va a hacer.',
  queEsElMapa:
    'Es el papel donde usted dijo qué carpeta es qué punto. Lo va a ver entero antes de que se escriba nada.',
  sinMapa:
    'Falta el mapa de carpetas. Sin él no hay forma de saber a qué punto va cada carpeta, y esta '
    + 'pantalla no lo va a deducir de cómo se llame la carpeta: leer una etiqueta como si fuera una '
    + 'identidad es lo que produjo el desfase anterior.',
  revise:
    'Esto es lo que va a quedar escrito. Revíselo antes de que se suba nada.',
  noSePuedeBorrar:
    'Una foto colgada del punto equivocado NO se puede borrar: las reglas de la base lo prohíben. '
    + 'Se puede no cometerla.',
  paradas:
    'No se sube ni un archivo hasta que esto quede resuelto.',
  heRevisado:
    'He revisado punto por punto a qué apoyo va cada carpeta.',
  siSeCorta:
    'Si algo se corta, lo que ya entró se queda. Puede repetir la subida: no se duplica nada.',
  sinPermiso:
    'Su sesión puede mirar esta pantalla, pero no subir fotografías. El botón del final no se '
    + 'encenderá. Se dice aquí, antes de nada, porque es la base la que decide si esto entra: más '
    + 'vale saberlo ahora que después de media hora de trabajo.',
  sinContextoSeguro:
    'Este navegador no ofrece el motor de huellas digitales. Suele pasar al abrir la aplicación por '
    + 'la dirección de red del computador en vez de por su dirección segura. Sin huella no se puede '
    + 'saber qué fotos ya están cargadas, y sin eso no se sube nada.',
  porQueNoSeRefresca:
    'La línea NO se actualiza sola. Refrescarla ahora borraría este acuse en el mismo instante en '
    + 'que se genera, y sobre escrituras que no se pueden deshacer usted se quedaría sin ningún papel. '
    + 'Se actualiza cuando usted lo pida, después de leer.',
} as const;

/**
 * Las filas de la tabla, a partir de los grupos del reparto.
 *
 * `nombreCampo` viaja para que él reconozca el punto: el nombre canónico lo
 * tipificó él, pero lo que vio en el aparato es el otro, y hay líneas en las que
 * los dos no coinciden: el aparato grabó nombres irregulares.
 */
export function filasDeReparto(
  grupos: {
    carpeta: string | null; nombreCanonico: string; apoyoCampo?: string;
    fotos: number; nuevas: number; yaEstan: number; esEmpalme: boolean;
  }[],
): FilaDeReparto[] {
  return grupos.map((g) => ({
    carpeta: g.carpeta ?? '—',
    nombreCanonico: g.nombreCanonico,
    nombreCampo: g.apoyoCampo ?? g.nombreCanonico,
    fotos: g.fotos,
    nuevas: g.nuevas,
    yaEstan: g.yaEstan,
    esEmpalme: g.esEmpalme,
    // Un solo estado por fila, y el que manda es «hay algo que subir».
    estado: g.nuevas > 0 ? 'entra nueva' : (g.yaEstan > 0 ? 'ya está' : 'nada que subir'),
  }));
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/**
 * El pie de la tabla, en una frase. Se arma aquí y no en el componente para que
 * no pueda discrepar de lo que de verdad se manda.
 */
export function pieDelReparto(resumen: {
  fotos: number; puntos: number; nuevas: number; yaEstan: number; enEmpalmes: number;
}): string {
  const partes = [
    `${resumen.fotos} ${plural(resumen.fotos, 'foto', 'fotos')} en ${resumen.puntos} ${plural(resumen.puntos, 'punto', 'puntos')}`,
    `${resumen.nuevas} ${plural(resumen.nuevas, 'entraría nueva', 'entrarían nuevas')}`,
    `${resumen.yaEstan} ya ${plural(resumen.yaEstan, 'está', 'están')}`,
  ];
  if (resumen.enEmpalmes > 0) {
    partes.push(`${resumen.enEmpalmes} de ellas en EMPALMES, que en este sistema NO son apoyos`);
  }
  return partes.join(' · ');
}

/**
 * Lo que impide subir, dicho por su nombre.
 *
 * Un botón apagado sin motivo es lo más caro que hay en una pantalla que se usa
 * una vez cada tres meses: quien no sabe qué le falta, recarga y vuelve a
 * empezar. Es la misma regla que ya rige en «Cargar».
 */
export function faltasParaSubir(estado: {
  puedeSubir: boolean;
  rol: string;
  hayIndice: boolean;
  hayMapa: boolean;
  problemas: number;
  nuevas: number;
  reviso: boolean;
  escribioSubir: boolean;
}): string[] {
  const xs: string[] = [];
  if (!estado.puedeSubir) {
    xs.push(`su sesión entró con el permiso «${estado.rol}», y subir fotografías necesita permiso de cuadrilla o superior`);
  }
  if (!estado.hayIndice) xs.push('falta el índice del registro: sin él no se sabe de qué carpeta salió cada archivo');
  if (!estado.hayMapa) xs.push('falta el mapa de carpetas: sin él no se sabe a qué punto va cada carpeta');
  if (estado.problemas > 0) {
    xs.push(`hay ${estado.problemas} ${plural(estado.problemas, 'cosa que no casa', 'cosas que no casan')}, y no se sube ni un archivo hasta resolverlas`);
  }
  if (estado.hayIndice && estado.hayMapa && estado.problemas === 0 && estado.nuevas === 0) {
    xs.push('no hay ninguna foto nueva que subir: todas las de esta carpeta ya están en la base');
  }
  if (!estado.reviso) xs.push('todavía no ha confirmado que revisó punto por punto a qué apoyo va cada carpeta');
  if (!estado.escribioSubir) xs.push('falta escribir SUBIR en el campo de confirmación');
  return xs;
}

/** La frase del botón. Dice CUÁNTAS, para que nadie pulse sin saber el tamaño. */
export const rotuloDelBoton = (nuevas: number) =>
  `Subir ${nuevas === 1 ? 'la fotografía' : `las ${nuevas}`}`;

/** La frase de la confirmación en frío. */
export const frasePedirConfirmacion = (nuevas: number) =>
  `Van a subir ${nuevas} ${plural(nuevas, 'fotografía', 'fotografías')}. Escriba SUBIR para confirmar.`;

/** La frase del progreso. */
export const fraseDelProgreso = (hechas: number, total: number, punto: string) =>
  `Subiendo ${hechas} de ${total}… (${punto})`;

/** Lo que se aceptó como confirmación. Se compara sin espacios y sin mayúsculas. */
export const confirmoConLaPalabra = (escrito: string) =>
  escrito.trim().toUpperCase() === 'SUBIR';

/**
 * El acuse, contado por punto.
 *
 * Cuenta también LO QUE QUEDÓ FUERA: «no entró» sin el porqué se lee como «se
 * perdió», y sobre una escritura que no se puede deshacer eso es lo peor que se
 * le puede decir a quien firma.
 */
export function actaDeFotos(entrada: {
  linea: string;
  quien: string;
  cuando: string;
  intentos: { punto: string; entro: boolean; yaEstaba: boolean }[];
  fuera: FueraDeLaSubida[];
}): ActaDeFotos {
  const porPunto = new Map<string, { punto: string; entraron: number; yaEstaban: number; fallaron: number }>();
  const tocar = (punto: string) => {
    let p = porPunto.get(punto);
    if (!p) { p = { punto, entraron: 0, yaEstaban: 0, fallaron: 0 }; porPunto.set(punto, p); }
    return p;
  };
  for (const i of entrada.intentos) {
    const p = tocar(i.punto);
    if (i.yaEstaba) p.yaEstaban += 1;
    else if (i.entro) p.entraron += 1;
  }
  for (const f of entrada.fuera) tocar(f.punto).fallaron += 1;

  return {
    intentadas: entrada.intentos.length + entrada.fuera.length,
    entraron: entrada.intentos.filter((i) => i.entro && !i.yaEstaba).length,
    yaEstaban: entrada.intentos.filter((i) => i.yaEstaba).length,
    porPunto: [...porPunto.values()],
    fuera: entrada.fuera,
    cuando: entrada.cuando,
    quien: entrada.quien,
    linea: entrada.linea,
  };
}

/** La frase de cabecera del acuse. */
export const resumenDelActa = (a: ActaDeFotos) =>
  `Entraron ${a.entraron} de ${a.intentadas}.`;

/** Una línea del acuse, por punto, en su idioma. */
export function lineaDelActa(p: ActaDeFotos['porPunto'][number]): string {
  const partes: string[] = [];
  if (p.entraron) partes.push(`${p.entraron} ${plural(p.entraron, 'foto', 'fotos')}, ${plural(p.entraron, 'dentro', 'todas dentro')}`);
  if (p.yaEstaban) partes.push(`${p.yaEstaban} ya ${plural(p.yaEstaban, 'estaba', 'estaban')}`);
  if (p.fallaron) partes.push(`${p.fallaron} no ${plural(p.fallaron, 'entró', 'entraron')}`);
  return `${p.punto} — ${partes.join(' · ') || 'nada que hacer'}`;
}

/**
 * El mapa que se descarga al final: EL MISMO archivo que él cargó, con las
 * carpetas de hoy marcadas.
 *
 * Es lo que hace que sea un documento y no dos: la pantalla lo pinta, él lo
 * corrige, y lo que se baja tiene la MISMA forma que lee el guion de consola.
 * No hay copia, ni traducción, ni «versión bonita para el informe».
 */
export function mapaActualizado(
  mapa: { _nota?: string; linea?: string; carpetas?: { carpeta: string; nombreCanonico: string; yaCargado?: boolean }[] } | null,
  filas: { carpeta: string; nombreCanonico: string }[],
  cargadas: string[],
): unknown {
  const yaCargadas = new Set(cargadas);
  const destino = new Map(filas.map((f) => [f.carpeta, f.nombreCanonico]));
  const carpetas = (mapa?.carpetas ?? []).map((f) => ({
    ...f,
    // Si él corrigió el destino en pantalla, es SU corrección la que se guarda.
    nombreCanonico: destino.get(f.carpeta) ?? f.nombreCanonico,
    yaCargado: f.yaCargado === true || yaCargadas.has(f.carpeta),
  }));
  return { ...(mapa ?? {}), carpetas };
}
