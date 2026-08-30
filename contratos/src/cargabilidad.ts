// ============================================================================
// cargabilidad.ts — el molde del histórico de cargabilidad ELÉCTRICA
// ----------------------------------------------------------------------------
// QUÉ GUARDA. Cuánta corriente circuló por una línea, hora a hora, y de dónde
// salió ese dato. **Es cargabilidad ELÉCTRICA** — no la utilización mecánica del
// apoyo, que vive en `activos.ts` y es otro veredicto (`99 §ADR-088`, `30 · M-02`).
//
// ⚠️ LA DECISIÓN QUE MANDA SOBRE ESTE ARCHIVO: **UN DOCUMENTO POR LÍNEA Y DÍA**,
// con las 24 horas dentro. No un documento por lectura.
//
// Y no es una preferencia de modelado, es aritmética de factura. Un año de datos
// horarios son **8.760 lecturas por línea**. Guardadas una a una, el botón de
// «histórico completo» de diez líneas pediría **87.600 documentos de un solo
// clic** — más de lo que el plan gratuito da en un día entero, y el módulo
// dejaría de funcionar justo cuando empezara a servir. Empaquetadas por día, el
// mismo año son **3.650**; y el tablero, que lee el resumen diario, unas diez.
// Es `CLAUDE.md §3.1`: «antes el que APAGA que el que COBRA» aplicado al diseño,
// no al proveedor.
//
// LOS TRES DOCUMENTOS Y POR QUÉ SON TRES:
//
//   · `DiaDeCargabilidad` — el dato crudo, hora a hora. Se lee cuando alguien
//     abre un día o pide una gráfica fina.
//   · `ResumenDiarioCargabilidad` — máximo, mínimo, media y horas en cada banda
//     de ESE día. Es lo que lee el tablero y el selector de fechas, y por eso va
//     APARTE: pedir un año de días completos para pintar una línea de tendencia
//     sería traerse 8.760 lecturas para enseñar 365 puntos.
//   · `CargaDeCargabilidad` — de qué archivo salió todo: nombre, cuándo, quién,
//     cuántas filas entraron y cuántas no. Sin esto, dentro de seis meses nadie
//     sabe de dónde vino un número — y este producto entero se sostiene sobre
//     poder responder esa pregunta.
// ============================================================================
import { z } from 'zod';
import { Base, Id, Instante, OrgId, Uid } from './comunes.ts';

/**
 * DE DÓNDE SALE EL PORCENTAJE. Es obligatorio y no tiene valor por defecto.
 *
 * ⚠️ Es la misma regla que `99 §ADR-086/087` puso en las capas del mapa: una
 * magnitud sin su naturaleza declarada es una magnitud que miente. Aquí la
 * mentira concreta sería confundir el % que trajo el archivo —calculado contra
 * la capacidad NOMINAL, que es fija— con el que sale de la ampacidad IEEE 738
 * del día, que se mueve con el clima. Medido en LN-627: los mismos 512 A son el
 * 71 % de la nominal y el 100 % de la de un día en calma.
 *
 *   · `declarada` — el porcentaje venía hecho en el archivo.
 *   · `derivada`  — lo calculamos de la corriente y la capacidad NOMINAL del
 *                   propio archivo, porque el archivo no lo traía.
 *
 * NO existe un tercer valor para «contra la ampacidad del día»: ese número no se
 * GUARDA, se calcula al mirarlo, porque depende de con qué condiciones de
 * ambiente se pida. Guardarlo lo convertiría en un segundo dueño (`§ADR-052`).
 */
export const NaturalezaCargabilidad = z.enum(['declarada', 'derivada']);

/** `AAAA-MM-DD`. Se valida la FORMA aquí; que el día exista lo mira el motor. */
export const DiaIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'la fecha va como AAAA-MM-DD');

/** La hora, como clave del mapa: `00`…`23`. Texto, porque es una clave. */
export const ClaveHora = z.string().regex(/^([01]\d|2[0-3])$/, 'la hora va de «00» a «23»');

/**
 * LO QUE SE MIDIÓ EN UNA HORA.
 *
 * ⚠️ TODO OPCIONAL MENOS NADA, y a propósito: un archivo puede traer solo el
 * porcentaje, o solo la corriente, o las dos. Lo que NO puede pasar es que un
 * hueco se guarde como cero — por eso los campos se OMITEN cuando no hay dato,
 * y nunca se escriben a `0`. En una línea de transmisión el 0 % no es «no se
 * sabe»: es que la línea está fuera de servicio, que es un hecho grave.
 */
export const HoraDeCargabilidad = z.object({
  cargabilidad_pct: z.number().min(0).max(400).optional(),
  corriente_A: z.number().min(0).optional(),
  potenciaActiva_MW: z.number().optional(),
  potenciaReactiva_MVAr: z.number().optional(),
  tension_kV: z.number().min(0).optional(),
  capacidadNominal_A: z.number().positive().optional(),
  estado: z.string().max(120).optional(),
  observaciones: z.string().max(500).optional(),
  /** Obligatoria si hay porcentaje. Lo comprueba el `refine` de abajo. */
  naturaleza: NaturalezaCargabilidad.optional(),
}).refine((h) => h.cargabilidad_pct == null || h.naturaleza != null, {
  message: 'una cargabilidad sin declarar su naturaleza no se guarda: no se sabría contra qué se calculó',
  path: ['naturaleza'],
});

/**
 * UN DÍA DE UNA LÍNEA. El documento que de verdad se guarda.
 *
 * ⚠️ SU IDENTIDAD ES DETERMINISTA — `{orgId}__{linea}__{circuito}__{fecha}` — y
 * NO un UUID. Es la excepción razonada a `ADR-001`, y la razón es exactamente lo
 * que el Ingeniero pidió: **volver a cargar el mismo archivo no puede duplicar
 * el histórico**. Con un id al azar, la segunda carga crearía un documento
 * gemelo y ese día tendría dos verdades; con el id derivado del instante, la
 * segunda carga ESCRIBE ENCIMA del mismo sitio, que es lo correcto — una
 * corrección es el mismo día, no un día nuevo.
 *
 * La regla de `ADR-001` sigue intacta donde importa: la identidad de un APOYO
 * —un activo físico, que se renumera y se secciona— sigue siendo un UUID
 * inmutable. Una medición no es un activo.
 */
export const DiaDeCargabilidad = Base.extend({
  /** La línea, TAL Y COMO LA NOMBRA EL ARCHIVO. Ver la nota de abajo. */
  linea: z.string().min(1).max(120),
  /**
   * El `id` de la línea en `lineas/`, cuando se ha podido reconocer.
   *
   * ⚠️ OPCIONAL A PROPÓSITO, y esto es una decisión de producto: el archivo de
   * cargabilidad viene de SCADA y nombra las líneas a su manera, que no tiene
   * por qué coincidir con el inventario. Exigir la correspondencia dejaría fuera
   * el 100 % de los datos el primer día. Se guarda lo que el archivo dice, y
   * emparejarlo es un paso posterior y reversible — nunca un requisito de
   * entrada. `null` significa «todavía no se ha emparejado», no «no existe».
   */
  lineaId: Id.optional(),
  circuito: z.string().max(60).optional(),
  subestacionOrigen: z.string().max(120).optional(),
  subestacionDestino: z.string().max(120).optional(),
  fecha: DiaIso,
  /**
   * Las horas medidas, por su clave. **Solo las que tienen dato**: una hora sin
   * lectura NO aparece. Recorrer de 0 a 23 rellenando huecos es cosa de quien
   * pinta, y así el documento nunca afirma una medida que nadie tomó.
   */
  horas: z.record(ClaveHora, HoraDeCargabilidad),
  /** De qué carga vino la última escritura de este día. Para poder rastrearlo. */
  cargaId: Id,
});

/**
 * EL RESUMEN DE UN DÍA — lo que lee el tablero y el selector de fechas.
 *
 * Es un dato DERIVADO y por eso se puede reconstruir entero desde los días; se
 * guarda igualmente porque leerlo es la diferencia entre 365 documentos y 8.760.
 * Al ser derivado, **nunca es la fuente**: si algún día discrepara del día que
 * resume, manda el día.
 */
export const ResumenDiarioCargabilidad = Base.extend({
  linea: z.string().min(1).max(120),
  lineaId: Id.optional(),
  fecha: DiaIso,
  /** Cuántas horas del día traen medida. De 0 a 24; el resto son huecos. */
  horasConMedida: z.number().int().min(0).max(24),
  maxima_pct: z.number().optional(),
  minima_pct: z.number().optional(),
  promedio_pct: z.number().optional(),
  /** La hora del máximo, para poder señalarla sin abrir el día entero. */
  horaMaxima: ClaveHora.optional(),
  /** Cuántas horas cayeron en cada banda de lectura. Suma ≤ `horasConMedida`. */
  porBanda: z.object({
    normal: z.number().int().min(0).max(24),
    elevada: z.number().int().min(0).max(24),
    atencion: z.number().int().min(0).max(24),
    sobrecarga: z.number().int().min(0).max(24),
  }),
});

/** En qué acabó el procesamiento de un archivo. Sin texto libre. */
export const EstadoCarga = z.enum([
  'previsualizada',   // se leyó y se enseñó, pero NADIE dijo que se guardara
  'guardada',         // sus registros están en el histórico
  'descartada',       // se leyó y se tiró; queda el rastro de que se intentó
]);

/**
 * DE QUÉ ARCHIVO SALIÓ TODO.
 *
 * ⚠️ **No se guarda el archivo, solo su rastro.** El `.xlsx` original es material
 * de operación del cliente y este sistema no tiene dónde ponerlo que no sea el
 * R2 privado; hasta que eso se decida, se conserva lo que permite responder «¿de
 * dónde salió este número?»: nombre, cuándo, quién y qué entró. Y la huella, que
 * es lo que permite reconocer el MISMO archivo aunque venga renombrado.
 */
export const CargaDeCargabilidad = Base.extend({
  nombreArchivo: z.string().min(1).max(260),
  /** SHA-256 del contenido. Dos archivos con el mismo contenido son el mismo. */
  huella: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  hoja: z.string().max(120).optional(),
  cargadoEn: Instante,
  cargadoPor: Uid,
  filasDelArchivo: z.number().int().nonnegative(),
  registrosGuardados: z.number().int().nonnegative(),
  filasConError: z.number().int().nonnegative(),
  /** Qué columna del archivo se leyó como qué campo. Sin esto no se audita nada. */
  mapeo: z.record(z.string(), z.string()),
  /** Qué líneas y qué días tocó. Permite deshacer y saber qué pisó. */
  lineas: z.array(z.string().max(120)).max(500),
  desde: DiaIso.optional(),
  hasta: DiaIso.optional(),
  estado: EstadoCarga,
});

// ── Tipos ───────────────────────────────────────────────────────────────────
export type NaturalezaCargabilidad = z.infer<typeof NaturalezaCargabilidad>;
export type HoraDeCargabilidad = z.infer<typeof HoraDeCargabilidad>;
export type DiaDeCargabilidad = z.infer<typeof DiaDeCargabilidad>;
export type ResumenDiarioCargabilidad = z.infer<typeof ResumenDiarioCargabilidad>;
export type CargaDeCargabilidad = z.infer<typeof CargaDeCargabilidad>;
export type EstadoCarga = z.infer<typeof EstadoCarga>;

/**
 * EL `id` DE UN DÍA, derivado y estable.
 *
 * Se normaliza el nombre de la línea —sin tildes, sin espacios dobles, en
 * minúsculas— porque «LN-627», «ln-627 » y «LN‑627» son la misma línea escrita
 * por tres manos distintas, y con tres ids serían tres históricos. Lo que NO se
 * normaliza es lo que se GUARDA: el campo `linea` conserva el texto original,
 * que es el que el Ingeniero reconoce.
 */
export function idDelDia(orgId: string, linea: string, circuito: string | null | undefined, fecha: string): string {
  return [orgId, clave(linea), circuito ? clave(circuito) : '-', fecha].join('__');
}

export function idDelResumen(orgId: string, linea: string, fecha: string): string {
  return [orgId, clave(linea), fecha].join('__');
}

function clave(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2010-\u2015]/g, '-')      // guiones «bonitos» que copia Excel
    .toLowerCase().replace(/\s+/g, ' ').trim()
    .replace(/[^a-z0-9 .-]/g, '_');
}

/** Las tres colecciones nuevas, para que las reglas y la app las llamen igual. */
export const COLECCIONES_CARGABILIDAD = Object.freeze({
  dias: 'cargabilidad_dias',
  resumenes: 'cargabilidad_resumenes',
  cargas: 'cargabilidad_cargas',
} as const);

/** Cabe aquí porque las reglas de la base lo miran: quién puede escribir esto. */
export const ESCRIBE_CARGABILIDAD = 'rol_editor';

// Se declaran para que `OrgId`/`Uid` no queden como importaciones sin uso: el
// molde los usa a través de `Base`, y dejarlos fuera rompería el `tsc` estricto.
export type OrgIdDeCargabilidad = z.infer<typeof OrgId>;
export type UidDeCargabilidad = z.infer<typeof Uid>;
