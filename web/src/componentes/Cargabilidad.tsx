// ============================================================================
// componentes/Cargabilidad.tsx — la cargabilidad ELÉCTRICA, en pantalla
// ----------------------------------------------------------------------------
// QUÉ ES. La pestaña donde el Ingeniero suelta su Excel de cargabilidad y lo ve:
// qué columna es qué, qué filas entraron y cuáles no, y el comportamiento de la
// línea en gráficas. **Es la cargabilidad ELÉCTRICA** —cuánta corriente circula
// frente a la que se puede llevar— y no tiene nada que ver con la utilización
// mecánica del apoyo, que vive en la pestaña Cargas y es otro veredicto.
//
// AQUÍ NO HAY NI UNA FÓRMULA. Quien lee el archivo es `@lineas/importar/xlsx`;
// quien valida, deduplica, resume y analiza es `@lineas/nucleo/cargabilidad`; y
// la geometría de las gráficas sale de `vistas/cargabilidadVista`. Esta pantalla
// pinta y pregunta. Si tuviera su propia aritmética, el día que discrepara del
// informe nadie sabría cuál mirar.
//
// ⚠️ TODAVÍA NO GUARDA NADA, y se dice en pantalla. El histórico acumulable
// necesita una decisión del Ingeniero sobre el modelo de datos —un año de datos
// horarios son 8.760 registros POR LÍNEA, y guardarlos uno a uno haría que el
// botón de «histórico completo» se comiera la cuota gratuita de un solo clic—.
// Hasta que eso se decida, esta pantalla lee, comprueba y enseña; lo que no hace
// es prometer que se guardó. Una pantalla que dice «cargado» sobre algo que solo
// vive en la memoria del navegador es la peor de las mentiras posibles aquí.
//
// LAS CUATRO DECISIONES DE PANTALLA, Y POR QUÉ:
//
// 1. **El mapeo se ENSEÑA y se puede corregir ANTES de mirar un solo número.**
//    Una columna mapeada mal no da error: da una gráfica bonita y falsa.
// 2. **Los errores se cuentan y se pueden DESCARGAR.** «317 filas con error» sin
//    decir cuáles obliga a revisar el archivo a ojo.
// 3. **Las gráficas dibujan huecos como huecos.** Una hora sin medida parte la
//    línea; no se une con una recta que nadie midió.
// 4. **Nada viene preseleccionado en lo que decida.** Ni la línea de la gráfica
//    ni la medida de las barras: lo que aparece marcado se confirma en vez de
//    decidirse.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { filasDesde, leerXlsx } from '@lineas/importar/xlsx';
import { leerCsv } from '@lineas/importar/csv';
import {
  atipicos, bandaDe, BANDAS, CAMPOS, camposAusentes, detectarMapeo, elegirHoja,
  encontrarCabecera, histograma, mapaDeCalor, porLinea, porLineaDesdeResumenes, procesarLote,
  resumen, resumenDelHistorico, separarNuevos, serieDiaria, serieTemporal, tendencia,
} from '@lineas/nucleo/cargabilidad';
import {
  RELLENO_BANDA, TINTA_BANDA, tintaDe, areasDeBanda, csvDeErrores, etiquetaInstante,
  filtrarPorTexto, LIENZO, marcaDeTiempo, marcasDeRango, marcasDeTiempo, marcasX, marcasY, ordenarPor, paginar,
  REFERENCIAS, aCsv, techoY,
  tramosDeLinea, x, y, type Direccion,
} from '../vistas/cargabilidadVista';
import {
  cerosAlFinal, CRITERIOS_DE_FASE, encontrarEjeDeTiempo, estadisticoDeNombre, estadisticoPorFilaCorregido,
  FASES_POR_MAGNITUD, leerSenales, ordenDeLaCarga, pareceAncho, registrosDeVariosDias, revisarFasesPorDia,
  unirAnchas, unirPorDia,
} from '@lineas/nucleo/cargabilidadAncho';
import { desempaquetarDia, empaquetarPorDia, ESTADISTICOS, resumirDia } from '@lineas/nucleo/cargabilidad';
import {
  diasCompletos, guardarCarga, huellaDe, resumenesEntre, ultimoDiaGuardado, type Acuse,
} from '../datos/cargabilidadRepo';
import { nf } from '../vistas/formato';
import { Sello } from './Sello';
import nucleoPkg from '@lineas/nucleo/package.json';
import { ampacidadDeLinea, resistenciaDC } from '@lineas/nucleo/termica';
import {
  comportamientoEnElTiempo, desbalanceDeFases, disponibilidadDeVariables,
  desviacionDeTension, perdidasJoule, potenciasDelInstante,
} from '@lineas/nucleo/electrica';
import { contrasteConLaAmpacidad } from '@lineas/nucleo/cargabilidad';
import { puede, type SesionDePantalla } from '../datos/permisos';

const VERSION_DEL_MOTOR = nucleoPkg.version;

type Registro = Record<string, string | number | null>;
type Mapeo = Record<string, string>;

type Celda = string | number | boolean | null;

interface Cargado {
  nombre: string;
  cuando: Date;
  hoja: string;
  /** La hoja CRUDA. De aquí sale todo, y se puede volver a despiezar. */
  matriz: Celda[][];
  /** Qué fila se está usando como cabecera. Se detecta, y se puede corregir. */
  filaCabecera: number;
  /** Por qué se eligió esa fila (o por qué se leyó como matriz). Se dice. */
  porQue: string;
  /** `true` = exportación de SCADA transpuesta; `false` = tabla de siempre. */
  ancho: boolean;
  cabeceras: string[];
  filas: Record<string, Celda>[];
  /**
   * DE QUÉ ARCHIVO Y QUÉ ESTADÍSTICO SALIÓ CADA SEÑAL (`99 §ADR-112`).
   *
   * ⚠️ Sin esto, tres archivos del mismo día —máximo, promedio e instantáneo—
   * dejan tres señales con la MISMA etiqueta y no hay forma de separarlas: el
   * nombre del archivo es lo único que las distingue, y se pierde al unir.
   */
  estadisticoPorFila: Record<number, string | null> | null;
  porArchivo: { nombre: string; senales: number; estadistico: string | null; porQue: string }[];
  estadisticos: string[];
  /**
   * UN GRUPO POR DÍA (`99 §ADR-117`).
   *
   * ⚠️ `unirAnchas` exige que todos los archivos compartan EXACTAMENTE los
   * mismos instantes —alinear dos rejillas es interpolar—, así que dos días no
   * se unen. Pero el Ingeniero exporta el mes entero: treinta carpetas. Se
   * agrupan por la fecha de su nombre y cada día se une con los suyos; la
   * exigencia no se relaja, se aplica donde tiene sentido.
   */
  porDia: {
    fecha: string | null; matriz: Celda[][]; estadisticoPorFila: Record<number, string | null>;
    /** De qué ARCHIVO salió cada fila: la corrección del estadístico va por archivo (`99 §ADR-127`). */
    anotadas: Anotada[];
  }[];
  /** Lo mismo para la carga de UN día con varios archivos; `null` con un archivo solo. */
  anotadas: Anotada[] | null;
  /**
   * CÓMO SE LEYÓ LA FECHA, en la carga entera (`99 §ADR-127`). Se ENSEÑA: un
   * archivo de un día del 1 al 12 no demuestra nada, y leerlo día/mes es una
   * suposición que hay que decir, no un hecho.
   */
  ordenDeFecha: ReturnType<typeof ordenDeLaCarga> | null;
  /** Qué días traen más señales de las que caben en una magnitud. Se NOMBRAN. */
  revision: ReturnType<typeof revisarFasesPorDia>;
}

/** Una fila de la matriz unida: de qué archivo salió y qué estadístico dice su nombre. */
type Anotada = { fila: number; nombre: string; estadistico: string | null };

/** Bajar un texto como archivo. El navegador ya sabe; solo hay que pedírselo. */
function descargar(nombre: string, texto: string) {
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Cargabilidad({
  lineaAbierta, conductor, hipotesis, tensionNominal_kV, longitud_m, sesion }: {
  lineaAbierta?: string;
  /**
   * El conductor de la línea. **Sin él no hay veredicto**: la ampacidad sale de
   * sus propiedades, y sin ampacidad esta pantalla solo puede enseñar el
   * porcentaje que trae el archivo — que se calculó contra la capacidad NOMINAL
   * de placa, no contra la capacidad real (`99 §ADR-093`).
   *
   * Opcional a propósito: el banco de pruebas monta esta pantalla sin línea real
   * y tiene que seguir abriéndose.
   */
  conductor?: Record<string, unknown> | null;
  /** Donde el Ingeniero declara su condición ambiental, si la ha declarado. */
  hipotesis?: Record<string, unknown> | null;
  /**
   * La tensión NOMINAL de la línea y su longitud.
   *
   * ⚠️ Sirven para derivar los MVA y las pérdidas, y las dos van marcadas como
   * lo que son. La nominal **no es una medida**: si el archivo trae tensión, se
   * usa la del archivo y se dice; si no, se usa ésta y también se dice
   * (`99 §ADR-094`).
   */
  tensionNominal_kV?: number | null;
  longitud_m?: number | null;
  /**
   * Quién está mirando. **Sin ella no se puede guardar**, y la pantalla lo dice
   * en vez de enseñar un botón que va a fallar. El rol se comprueba además en
   * las reglas de la base, que son la última línea (`ADR-004`): esconder un
   * botón no impide nada, solo evita el trabajo perdido.
   */
  sesion?: Omit<SesionDePantalla, 'correo'>;
} = {}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [cargado, setCargado] = useState<Cargado | null>(null);
  const [mapeo, setMapeo] = useState<Mapeo>({});
  const [fallo, setFallo] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  /** Lo que hace falta cuando el archivo viene TRANSPUESTO, de SCADA. */
  const [linea, setLinea] = useState<string>(lineaAbierta ?? '');
  const [criterioFase, setCriterioFase] = useState('maxima');
  /**
   * QUÉ SEÑAL ES QUÉ, por ETIQUETA (`99 §ADR-127`). Iba por número de fila del
   * primer día y se aplicaba a todos: cada día trae sus filas en otro orden, así
   * que quitar la fase S del día 1 quitaba, en otro día, la R.
   */
  const [asignado, setAsignado] = useState<Record<string, string | null>>({});
  /**
   * EL ESTADÍSTICO (`99 §ADR-112`). Dos estados, y son cosas distintas:
   *  · `corregido`  — lo que el Ingeniero declara de un archivo cuyo nombre no
   *    lo dice, o dice mal. La detección es una PROPUESTA, no un veredicto.
   *  · `mirado`     — cuál de los presentes se está viendo en pantalla. No
   *    limita lo que se GUARDA: al guardar se escriben todos, cada uno en su
   *    documento. Es solo qué mira usted ahora.
   */
  const [corregido, setCorregido] = useState<Record<string, string>>({});
  const [mirado, setMirado] = useState<string | null>(null);
  /** El guardado y su acuse. `null` = todavía no se ha guardado esta carga. */
  const [guardando, setGuardando] = useState(false);
  const [acuse, setAcuse] = useState<Acuse | null>(null);
  const [falloGuardar, setFalloGuardar] = useState<string | null>(null);
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);

  // ── Leer el archivo ───────────────────────────────────────────────────────
  const alElegir = async (elegidos: File[]) => {
    if (!elegidos.length) return;
    setFallo(null); setLeyendo(true);
    try {
      // ⚠️ DOS FORMATOS Y VARIOS ARCHIVOS, y las dos cosas por el mismo motivo
      // (`99 §ADR-105`): así es como el sistema de supervisión exporta. El
      // histórico sale en CSV, y sale **una magnitud por archivo** — la tensión
      // RS en uno, la ST en otro, la TR en un tercero. Cargarlos de uno en uno
      // NO los suma: los tres son la misma magnitud del mismo día, así que el
      // segundo pisaría al primero. Se leen juntos o no se leen.
      const leidos: { nombre: string; datos: ArrayBuffer; matriz: Celda[][]; hoja: string }[] = [];
      for (const f of elegidos) {
        const datos = await f.arrayBuffer();
        const esCsv = /\.csv$/i.test(f.name);
        const { hojas } = esCsv ? await leerCsv(datos, { nombre: f.name }) : await leerXlsx(datos);
        if (!hojas.length) throw new Error(`«${f.name}» no trae ninguna hoja`);
        const cual = esCsv ? 0 : elegirHoja(hojas)!.indice;
        leidos.push({ nombre: f.name, datos, matriz: hojas[cual].matriz, hoja: hojas[cual].nombre });
      }
      // La huella cubre TODO lo que entró, en el orden en que entró: con varios
      // archivos, la de uno solo sería una procedencia que miente por omisión.
      const total = leidos.reduce((n, x) => n + x.datos.byteLength, 0);
      const juntos = new Uint8Array(total);
      let off = 0;
      for (const x of leidos) { juntos.set(new Uint8Array(x.datos), off); off += x.datos.byteLength; }
      setBytes(juntos.buffer);
      setAcuse(null); setFalloGuardar(null);

      const varios = leidos.length > 1;
      const entradas = leidos.map((x) => ({ nombre: x.nombre, matriz: x.matriz }));
      // ⚠️ `unirPorDia` mira además el orden de la fecha en la carga ENTERA y, si
      // un archivo demuestra mes/día y otros se leerían día/mes, se NIEGA con sus
      // nombres: esa negativa llega aquí como `fallo` y no se carga nada (`99 §ADR-127`).
      const dias = varios ? unirPorDia(entradas) : { porDia: [], fechas: [], ordenDeFecha: null };
      // Un solo día —o archivos sin fecha en el nombre— sigue el camino de
      // siempre; varios se procesan uno a uno y se concatenan.
      const variosDias = dias.porDia.length > 1;
      const union = varios ? (variosDias ? dias.porDia[0].union : unirAnchas(entradas)) : null;
      // (con un solo archivo no hace falta unir nada: su estadístico sale de su nombre)
      const hojas = [{ nombre: varios ? `${leidos.length} archivos` : leidos[0].hoja,
        matriz: union ? union.matriz : leidos[0].matriz }];
      const archivo = { name: varios ? leidos.map((x) => x.nombre).join(' + ') : leidos[0].nombre };

      // ⚠️ NI LA PRIMERA HOJA NI LA MÁS GRANDE: la que MÁS CAMPOS RECONOCE
      // (`§ADR-088`). Un libro de operación suele traer portada y notas; abrir
      // por la primera enseña la portada, y abrir por la mayor puede enseñar un
      // registro que no es éste.
      const hoja = hojas[0];
      // ⚠️ Y LA CABECERA CASI NUNCA ES LA FILA 1. Con el primer archivo real del
      // Ingeniero, suponerlo dio UNA columna sin nombre y cero campos: su hoja
      // empieza por un título. Se busca la fila que más campos reconoce.
      const cab = encontrarCabecera(hoja.matriz);

      // ⚠️ ¿TABLA O MATRIZ TRANSPUESTA? (`§ADR-088`). Una exportación de SCADA
      // no tiene cabecera que encontrar: el tiempo va en COLUMNAS y cada
      // magnitud en su fila. Buscar mejor la cabecera no arregla eso — hay que
      // reconocer la FORMA, y son dos caminos distintos desde aquí.
      const forma = pareceAncho(hoja.matriz, cab);
      const fila = cab.fila ?? 0;
      const { cabeceras, filas } = filasDesde(hoja.matriz, fila);
      if (!forma.ancho && !filas.length) throw new Error('el archivo no trae ninguna fila con datos');

      // ⚠️ UN EXPORT DE LA RED ENTERA NO SE ASIGNA SOLO (`99 §ADR-105`).
      // Estos archivos no traen las señales de UNA línea: traen las de TODAS —
      // 7.302 entre los tres del 2026-01-01, y de ésas al Ingeniero le importan
      // tres—. Y como todas dicen «U», el reconocedor las acierta TODAS, así que
      // la propuesta automática combinaría la tensión de media Colombia en un
      // solo número por hora. Eso no da error: da una gráfica falsa con cara de
      // buena, que es justo contra lo que avisa `nucleo/cargabilidadAncho.js`.
      //
      // Por encima del umbral se dejan TODAS en «no usar» y se dice por qué. El
      // umbral no es un gusto: una bahía exporta un puñado de señales —tres
      // corrientes, tres tensiones, P, Q y poco más—; cientos significa que el
      // archivo es del sistema entero y hay que elegir.
      // ⚠️ EL TOPE CUENTA POR MAGNITUD Y ESTADÍSTICO, no señales sueltas
      // (`99 §ADR-117`). Contar el total dejaba fuera el caso bueno: un mes de
      // UNA bahía son ~38 señales —ocho magnitudes por cinco estadísticos— y
      // ninguna es ambigua. Lo que hay que impedir es COMBINAR: tres señales de
      // la misma magnitud y el mismo estadístico son las tres fases y se
      // combinan bien; más de tres es que el archivo trae media red.
      const ejeDelArchivo = forma.ancho ? encontrarEjeDeTiempo(hoja.matriz) : null;
      const senalesDelArchivo = ejeDelArchivo ? leerSenales(hoja.matriz, ejeDelArchivo) : [];
      // ⚠️ LA REVISIÓN MIRA TODOS LOS DÍAS (`99 §ADR-127`). Se contaba sobre
      // `dias.porDia[0]`, el día más antiguo: un «(1)» del día 14 —una cuarta
      // corriente— pasaba sin que nadie lo mirara. Medido sobre los archivos de
      // enero: cuatro días con una fase repetida, y ninguno era el primero. La
      // cuenta vive en el núcleo, con prueba de oro; aquí solo se pregunta.
      // Y «no usar» se siembra con las etiquetas de TODA la carga: sembrar solo
      // las del día 1 dejaba fuera las señales que ese día no traía.
      const diasARevisar = !forma.ancho ? [] : variosDias
        ? dias.porDia.map((d) => ({
          fecha: d.fecha, matriz: d.union.matriz, estadisticoPorFila: d.union.estadisticoPorFila,
        }))
        : [{ fecha: null, matriz: hoja.matriz, estadisticoPorFila: union?.estadisticoPorFila ?? null }];
      const revision = revisarFasesPorDia(diasARevisar);
      setAsignado(revision.ambiguo
        ? Object.fromEntries(revision.etiquetas.map((e) => [e, null]))
        : {});
      setLinea(lineaAbierta ?? '');
      setCargado({
        nombre: archivo.name, cuando: new Date(), hoja: hoja.nombre,
        matriz: hoja.matriz, filaCabecera: fila,
        porQue: union
          ? `${union.porQue} — ${union.deCada.map((d) => `${d.nombre}: ${d.senales}`).join(' · ')}`
          : (forma.ancho ? forma.porQue : cab.porQue),
        ancho: forma.ancho, cabeceras, filas,
        // Con varios archivos la anotación la trae `unirAnchas`; con uno solo
        // se lee de su nombre. El mismo dato por los dos caminos, no dos verdades.
        estadisticoPorFila: union?.estadisticoPorFila ?? null,
        anotadas: union?.senales ?? null,
        // Con un archivo solo, su propio eje; con varios, la carga entera.
        ordenDeFecha: dias.ordenDeFecha ?? (ejeDelArchivo
          ? ordenDeLaCarga([{ nombre: leidos[0].nombre, orden: ejeDelArchivo.ordenDeFecha }])
          : null),
        revision,
        // ⚠️ DE TODOS LOS DÍAS, no del primero (`99 §ADR-119`). Se calculaba
        // sobre `union`, que es el día más antiguo, y de ahí salían los
        // estadísticos «presentes» — que es lo que decide QUÉ SE GUARDA. Con un
        // primer día que solo traía máximos, los mínimos de los otros veinte
        // días se cargaron, se enseñaron… y no se guardaron. Sin un solo error.
        porArchivo: variosDias
          ? dias.porDia.flatMap((d) => d.union.deCada.map((x) => ({
            nombre: x.nombre, senales: x.senales, estadistico: x.estadistico, porQue: x.porQueEstadistico,
          })))
          : union
          ? union.deCada.map((d) => ({
            nombre: d.nombre, senales: d.senales, estadistico: d.estadistico, porQue: d.porQueEstadistico,
          }))
          : [{
            nombre: leidos[0].nombre, senales: senalesDelArchivo.length,
            estadistico: estadisticoDeNombre(leidos[0].nombre).id,
            porQue: estadisticoDeNombre(leidos[0].nombre).porQue,
          }],
        estadisticos: variosDias
          ? [...new Set(dias.porDia.flatMap((d) => d.union.estadisticos))]
          : union
          ? union.estadisticos
          : [estadisticoDeNombre(leidos[0].nombre).id].filter(Boolean) as string[],
        porDia: variosDias
          ? dias.porDia.map((d) => ({
            fecha: d.fecha, matriz: d.union.matriz, estadisticoPorFila: d.union.estadisticoPorFila,
            anotadas: d.union.senales,
          }))
          : [],
      });
      setCorregido({});
      setMirado(null);
      if (!forma.ancho) setMapeo(detectarMapeo(cabeceras).mapeo);
    } catch (e) {
      setFallo((e as Error).message);
      setCargado(null);
    } finally {
      setLeyendo(false);
      if (entrada.current) entrada.current.value = '';   // permite recargar el MISMO archivo
    }
  };

  const descartar = () => {
    setCargado(null); setMapeo({}); setFallo(null);
    setAcuse(null); setFalloGuardar(null); setBytes(null);
  };

  /**
   * MOVER LA CABECERA A MANO. La detección acierta sola en un archivo normal,
   * pero cuando no —una hoja con dos títulos, una tabla que empieza a media
   * página— esto es lo que evita tener que salir a arreglar el Excel.
   */
  const usarFila = (fila: number) => {
    if (!cargado) return;
    const { cabeceras, filas } = filasDesde(cargado.matriz, fila);
    setCargado({ ...cargado, filaCabecera: fila, cabeceras, filas,
      porQue: `la señaló usted: fila ${fila + 1}` });
    setMapeo(detectarMapeo(cabeceras).mapeo);
  };

  // ── El estadístico, resuelto: lo detectado y lo que usted haya corregido ──
  const porArchivo = useMemo(() => (cargado?.porArchivo ?? []).map((a) => ({
    ...a, resuelto: corregido[a.nombre] ?? a.estadistico ?? null,
  })), [cargado, corregido]);

  /** Los presentes de verdad, sin repetir. Si hay más de uno, hay que elegir cuál se MIRA. */
  const presentes = useMemo(
    () => [...new Set(porArchivo.map((a) => a.resuelto).filter(Boolean))] as string[],
    [porArchivo],
  );

  /** El que se está mirando: el suyo, o el máximo si está, o el primero que haya. */
  const verAhora = useMemo(() => {
    if (mirado && presentes.includes(mirado)) return mirado;
    return presentes.includes('maximo') ? 'maximo' : (presentes[0] ?? null);
  }, [mirado, presentes]);

  /**
   * LOS DÍAS DE LA CARGA, con el estadístico que usted haya corregido aplicado
   * ARCHIVO POR ARCHIVO y en TODOS los días (`99 §ADR-127`).
   *
   * ⚠️ Antes se traducía «estadístico detectado → corregido» y solo en el primer
   * día: dos archivos sin marca corregidos distinto caían en el mismo, y en los
   * demás días la fila seguía sin estadístico — que es entrar en TODOS los que
   * se guardan. Es la misma lista para mirar y para guardar: no dos verdades.
   */
  const diasDeLaCarga = useMemo(() => {
    if (!cargado?.ancho) return [];
    if (cargado.porDia.length) {
      return cargado.porDia.map((d) => ({
        fecha: d.fecha, matriz: d.matriz,
        estadisticoPorFila: estadisticoPorFilaCorregido(d.anotadas, corregido),
      }));
    }
    return [{
      fecha: null, matriz: cargado.matriz,
      estadisticoPorFila: cargado.anotadas ? estadisticoPorFilaCorregido(cargado.anotadas, corregido) : null,
    }];
  }, [cargado, corregido]);

  // ── Procesar con el mapeo que haya AHORA ──────────────────────────────────
  /**
   * La lectura ANCHA, cuando toca. Se recalcula al cambiar línea, señal o criterio.
   *
   * ⚠️ TODOS los días con la MISMA asignación, y por ETIQUETA (`99 §ADR-127`).
   * Antes el día 1 llevaba la asignación y los demás ninguna —se leían con la
   * propuesta—, mientras el guardado la aplicaba por número de fila a todos: lo
   * que se miraba y lo que se guardaba no eran la misma cosa.
   */
  const ancho = useMemo(() => {
    if (!cargado?.ancho) return null;
    return registrosDeVariosDias(diasDeLaCarga, {
      linea: linea.trim(), asignadoPorEtiqueta: asignado, criterioFase, estadistico: verAhora,
    });
  }, [cargado, diasDeLaCarga, linea, asignado, criterioFase, verAhora]);

  const lote = useMemo(() => {
    if (!cargado) return null;
    if (cargado.ancho) {
      if (!linea.trim()) {
        return { faltanAncho: true, registros: [], errores: [], resumen: null, escalaPct: null };
      }
      const registros = ancho?.registros ?? [];
      return {
        faltan: [], registros, errores: [],
        escalaPct: { escala: 1, porQue: 'la matriz trae magnitudes, no porcentajes', ambigua: false },
        resumen: { filas: registros.length, correctos: registros.length, conError: 0,
          camposPorLlenar: camposAusentes(registros as never[]) },
      };
    }
    const faltan = Object.keys(CAMPOS).filter((c) => CAMPOS[c].requerido && !mapeo[c]);
    if (faltan.length) return { faltan, registros: [], errores: [], resumen: null, escalaPct: null };
    return { faltan: [], ...procesarLote(cargado.filas as Record<string, unknown>[], mapeo) };
  }, [cargado, mapeo, ancho, linea]);

  const registros = (lote?.registros ?? []) as Registro[];
  const tablero = useMemo(() => (registros.length ? resumen(registros) : null), [registros]);

  /**
   * LA AMPACIDAD DE LA LÍNEA — el denominador del veredicto.
   *
   * ⚠️ Sale del DUEÑO ÚNICO, con las condiciones que el Ingeniero haya declarado
   * en su hipótesis o, si no ha declarado ninguna, con la de referencia del
   * dominio marcada como ADOPTADA. Aquí no se elige ningún clima.
   */
  const referencia = useMemo(
    () => ampacidadDeLinea({ conductor, hipotesis }), [conductor, hipotesis]);

  /**
   * EL VEREDICTO SOBRE EL PICO DEL LOTE.
   *
   * ⚠️ Se hace sobre el PICO y no sobre cada fila a propósito: el veredicto de
   * una línea lo decide el momento en que más cargó, no su promedio. Y así el
   * coste es una comparación, no ocho mil.
   */
  /**
   * QUÉ VARIABLES TRAE ESTA CARGA — y cuáles no, y por qué no.
   *
   * ⚠️ Se DERIVA de la carga, nunca se cablea. Nace de un error mío que el
   * Ingeniero cazó: afirmé que su archivo no traía la columna de tensión sin
   * haberlo comprobado. Su archivo no está en el repositorio —es dato de
   * cliente— así que la pantalla no puede saberlo de antemano (`99 §ADR-094`).
   */
  const disponible = useMemo(
    () => {
      // Las cabeceras que nadie supo mapear. Se derivan igual que en el panel de
      // mapeo: si una de ésas era la tensión, el fallo es NUESTRO de sinónimos.
      const usadas = new Set(Object.values(mapeo).filter(Boolean));
      const sinReconocer = (cargado?.cabeceras ?? []).filter((c) => !usadas.has(c));
      return disponibilidadDeVariables(registros as never[], mapeo, sinReconocer);
    },
    [registros, mapeo, cargado]);

  /** Cómo se comportó el periodo: factor de carga, horas por banda y rampa. */
  const enElTiempo = useMemo(
    () => comportamientoEnElTiempo(registros as never[]), [registros]);

  const veredicto = useMemo(() => {
    if (referencia.ampacidad_A == null || !registros.length) return null;
    const conA = registros.filter((x_) => Number.isFinite(x_.corriente_A as number));
    if (!conA.length) return null;
    const pico = conA.reduce((a, b) =>
      ((b.corriente_A as number) > (a.corriente_A as number) ? b : a));
    // ⚠️ EL VEREDICTO DIVIDE ENTRE LA **VIGENTE**, no entre la de registro
    // (`99 §ADR-098`). Son el mismo número salvo cuando el clima del día da
    // menos que la ficha del fabricante; ahí manda el día, porque dividir
    // entre una capacidad que el cable no entrega hoy es lo que FERC llama
    // «sobrecarga inadvertida». La de registro sigue intacta y a la vista.
    return { pico, contraste: contrasteConLaAmpacidad(pico as never, referencia.vigente_A) };
  }, [registros, referencia]);

  /** Qué transportaba la línea en ese pico, y qué se perdía por el camino. */
  const operacion = useMemo(() => {
    const pico = veredicto?.pico;
    if (!pico) return null;
    return {
      potencias: potenciasDelInstante({
        tension_kV: pico.tension_kV as number | null,
        tensionNominal_kV: tensionNominal_kV ?? null,
        corriente_A: pico.corriente_A as number | null,
        potenciaActiva_MW: pico.potenciaActiva_MW as number | null,
        potenciaReactiva_MVAr: pico.potenciaReactiva_MVAr as number | null,
      }),
      // ⚠️ La temperatura se declara a propósito: es la del conductor con la que
      // se calculó la ampacidad, así que las pérdidas y la capacidad hablan del
      // MISMO estado térmico. Es el peor caso, y va dicho en la tarjeta.
      perdidas: perdidasJoule({
        conductor: conductor as never,
        corriente_A: pico.corriente_A as number | null,
        longitud_m: longitud_m ?? null,
        temperaturaConductor_C: referencia.temperatura.valor_C,
        resistenciaDC,
      }),
      tension: desviacionDeTension(pico.tension_kV as number, tensionNominal_kV as number),
    };
  }, [veredicto, conductor, longitud_m, tensionNominal_kV, referencia]);

  /**
   * GUARDAR LA CARGA. Empaqueta por día, resume y escribe — en ese orden, y con
   * las piezas que ya venían armadas del núcleo. Aquí no se calcula nada.
   */
  const guardar = async () => {
    if (!cargado || !sesion || !registros.length) return;
    setGuardando(true); setFalloGuardar(null);
    try {
      // ⚠️ SE GUARDAN TODOS LOS ESTADÍSTICOS, no solo el que se está mirando
      // (`99 §ADR-112`). Mirar es una cosa y guardar es otra: si el Ingeniero
      // suelta los tres archivos del día, los tres son dato suyo y los tres se
      // escriben, cada uno en SU documento. Guardar solo el visible le haría
      // perder dos tercios de lo que entregó sin que nada se lo dijera.
      // ⚠️ «NO SE GUARDAN ASÍ» TIENE QUE SER VERDAD (`99 §ADR-127`). La pantalla
      // lo promete de un archivo sin estadístico. Con un archivo solo ya lo
      // cumplía el repositorio —sus registros llegan sin estadístico y los
      // rechaza—, pero con varios no: las señales sin estadístico entran en TODOS
      // los que se leen, así que llegaban con la identidad del máximo, del
      // mínimo y del instantáneo a la vez, y el repositorio no tenía qué rechazar.
      const sinResolver = porArchivo.filter((a) => !a.resuelto);
      if (cargado.ancho && sinResolver.length) {
        throw new Error(`${nf(sinResolver.length)} archivo(s) sin decir qué estadístico traen (`
          + `${sinResolver.slice(0, 3).map((a) => `«${a.nombre}»`).join(', ')}${sinResolver.length > 3 ? '…' : ''}). `
          + 'Dígalo arriba, en «Qué trae cada archivo», y vuelva a guardar');
      }
      // Los mismos días y la misma asignación que se están mirando: no otra lectura.
      const todos = cargado.ancho && presentes.length
        ? presentes.flatMap((est) => registrosDeVariosDias(diasDeLaCarga, {
          linea: linea.trim(), asignadoPorEtiqueta: asignado, criterioFase, estadistico: est,
        }).registros)
        : (registros as never[]);

      const { dias } = empaquetarPorDia(todos as never[]);
      const resumenes = dias.map((d) => resumirDia(d));
      const fechas = [...new Set(dias.map((d) => d.fecha))].sort();
      const a = await guardarCarga({
        dias: dias as unknown as Record<string, unknown>[],
        resumenes: resumenes as unknown as Record<string, unknown>[],
        carga: {
          // ⚠️ El rótulo se acorta cuando son muchos; los nombres van en
          // `archivos`, que es donde vive el rastro (`99 §ADR-113`).
          nombreArchivo: cargado.nombre.length <= 260
            ? cargado.nombre
            : `${nf(cargado.porArchivo.length)} archivos de SCADA`,
          archivos: cargado.porArchivo.map((a) => a.nombre),
          hoja: cargado.hoja,
          huella: bytes ? await huellaDe(bytes) : undefined,
          filasDelArchivo: lote?.resumen?.filas ?? registros.length,
          registrosGuardados: registros.length,
          filasConError: lote?.resumen?.conError ?? 0,
          mapeo: cargado.ancho ? {} : mapeo,
          lineas: [...new Set(dias.map((d) => d.linea))],
          estadisticos: [...new Set(dias.map((d) => d.estadistico).filter(Boolean))] as string[],
          desde: fechas[0], hasta: fechas[fechas.length - 1],
        },
      }, { uid: sesion.uid, orgId: sesion.orgId });
      setAcuse(a);
    } catch (e) {
      setFalloGuardar((e as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className="panel">
      <h2>Parámetros eléctricos</h2>
      <p className="saludo">
        Lo que la línea está haciendo de verdad: <b>tensiones, corrientes y potencias —activa,
        reactiva y aparente— cada una con sus fases</b>. <b>Es un dato de OPERACIÓN</b> —viene de
        SCADA o de un informe— y no se deduce de la geometría ni del conductor.{' '}
        La <b>cargabilidad</b> es uno de estos parámetros, no otro nombre de la pantalla: es la
        corriente frente a la que el conductor puede llevar, y es la que enciende el dictamen de
        ampacidad. No es la utilización mecánica del apoyo: ésa vive en <b>Cargas</b> y es otro
        veredicto.
      </p>

      {/* ⚠️ EL AVISO VA ARRIBA Y NO AL FINAL. Mientras esto no guarde, decirlo
          después de las gráficas sería dejar que se mire media pantalla creyendo
          que hay un histórico detrás. */}
      {/* ⚠️ EL AVISO DICE LA VERDAD DE CADA CASO, no una fija. Antes decía
          siempre «no se guarda nada»; desde que guarda, decirlo igual sería
          mentir al revés — y quien lea que no se guarda no volverá a mirar. */}
      {!sesion ? (
        <p className="advertencia">
          <b>Aquí no se puede guardar:</b> no consta su sesión. La pantalla lee el archivo y lo
          enseña, pero al recargar se pierde.
        </p>
      ) : !puede(sesion, 'cargabilidad.cargar') ? (
        <p className="advertencia">
          <b>Su cuenta puede mirar, no guardar.</b> El histórico de carga lo escribe solo un
          administrador: es dato de operación que alimenta un dictamen de ampacidad. Puede leer el
          archivo y verlo; al recargar, se pierde.
        </p>
      ) : (
        <p className="fine">
          Lo que cargue se guarda por <b>día y línea</b> —las 24 horas en un solo documento— y
          volver a cargar el mismo día lo <b>reemplaza</b>, no lo duplica.
        </p>
      )}

      <div className="acciones">
        <button type="button" className="boton" disabled={leyendo}
          onClick={() => entrada.current?.click()}>
          {leyendo ? 'Leyendo…' : 'Cargar archivo de cargabilidad'}
        </button>
        {cargado && (
          <button type="button" className="boton chico" onClick={descartar}>Descartar esta carga</button>
        )}
        <input ref={entrada} type="file" accept=".xlsx,.csv" multiple hidden
          onChange={(e) => void alElegir([...(e.target.files ?? [])])} />
      </div>

      {fallo && <p className="advertencia alerta"><b>No se pudo leer el archivo:</b> {fallo}</p>}

      {/* El histórico se consulta SIN cargar nada: es lo que se mira el día que
          no hay archivo nuevo, que son casi todos. */}
      {sesion && <HistoricoGuardado sesion={sesion} lineaAbierta={lineaAbierta} />}

      {/* ⚠️ EL VACÍO SE DICE. Orden del Ingeniero (2026-08-29): «no coloques
          información basura en el módulo de cargabilidad, ahí solo se deben
          reflejar datos reales que yo te entregue». Una pantalla muda invita a
          rellenarla con un ejemplo «para que se vea cómo queda», y de ahí a que
          alguien tome ese ejemplo por un dato hay un paso. Aquí no hay ejemplos,
          no hay datos de demostración y no los va a haber: lo que se ve sale de
          SU archivo o no se ve nada. Hay un guardián que lo comprueba. */}
      {!cargado && !fallo && (
        <>
          <p className="mapa-capas-n">
            <b>Aquí no hay nada hasta que usted cargue su archivo.</b> Este módulo no trae datos de
            ejemplo ni de demostración: todo lo que aparezca sale de lo que usted entregue, y por eso
            cada cifra se puede rastrear hasta su fila del Excel.
          </p>
          <LoQueSaldra referencia={referencia} />
          {/* ⚠️ Y EL ENTORNO ENTERO, VACÍO. Orden del Ingeniero (2026-09-04):
              «dame todo el entorno y los valores en 0 hasta que yo vaya cargando
              los archivos, pero necesito ver las gráficas, los parámetros y las
              variables». No choca con su orden del 29-08: enseñar el instrumento
              vacío —ejes, bandas de lectura, la ampacidad del conductor— no es
              inventar una medida. Lo que NO se hace es escribir «0 A» donde no
              hay lectura: un hueco no es un cero, y confundirlos es justo lo que
              este módulo existe para impedir (`99 §ADR-097`). */}
          <ElEntorno referencia={referencia} disponible={disponible}
            enElTiempo={enElTiempo} />
        </>
      )}

      {cargado && (
        <>
          <p className="mapa-capas-n">
            📄 <b>{cargado.nombre}</b> · hoja «{cargado.hoja}» · {nf(cargado.filas.length)} fila(s)
            {' '}· cargado el {cargado.cuando.toLocaleString('es-CO')}
          </p>

          {cargado.ancho ? (
            <SenalesDelScada cargado={cargado} ancho={ancho} linea={linea} alCambiarLinea={setLinea}
              porArchivo={porArchivo} presentes={presentes} verAhora={verAhora}
              alMirar={setMirado}
              alCorregir={(nombre, v) => setCorregido({ ...corregido, [nombre]: v })}
              lineaAbierta={lineaAbierta} criterioFase={criterioFase} alCambiarCriterio={setCriterioFase}
              asignado={asignado} alAsignar={setAsignado} />
          ) : (
            <>
              <CabeceraElegida cargado={cargado} alUsarFila={usarFila} />
              <MapeoDeColumnas cabeceras={cargado.cabeceras} mapeo={mapeo} alCambiar={setMapeo} />
            </>
          )}

          {cargado.ancho && !linea.trim() ? (
            <p className="advertencia">
              <b>Falta decir de qué línea es este archivo.</b> La exportación nombra la subestación y
              la bahía, no la línea — y atribuir estas mediciones a la línea equivocada es lo más
              caro de equivocar aquí, así que no se adivina.
            </p>
          ) : lote?.faltan?.length ? (
            <p className="advertencia">
              <b>Falta decir qué columna es {lote.faltan.map((c) => CAMPOS[c].rotulo).join(' y ')}.</b>{' '}
              Sin eso una fila no se puede fechar ni atribuir a una línea, así que no se procesa nada.
            </p>
          ) : (
            <>
              <ResumenDeLaCarga lote={lote!} registros={registros} nombre={cargado.nombre} />
    <FasesDeLaCarga registros={registros} />
    <GraficasPorFase registros={registros} />
              <VistaPrevia registros={registros} />
              {puede(sesion, 'cargabilidad.cargar') && registros.length > 0 && (
                <div className="tarjeta">
                  <p className="mapa-capas-t">Guardar en el histórico</p>
                  {acuse ? (
                    <>
                      <p className="mapa-capas-n">
                        ✅ Guardado: <b>{nf(acuse.dias)} día(s)</b> de línea,{' '}
                        {nf(acuse.resumenes)} resumen(es) diario(s).
                        {acuse.reemplazados > 0
                          ? <> ⚠️ <b>{nf(acuse.reemplazados)} de esos días YA estaban</b> y se han
                            reemplazado con lo que trae este archivo.</>
                          : <> Ninguno estaba antes: todos son nuevos.</>}
                      </p>
                      <p className="fine">
                        {nf(acuse.escrituras)} escritura(s) en total. Volver a cargar el mismo día
                        lo reemplaza otra vez; el histórico no se duplica y no se borra.
                      </p>
                    </>
                  ) : (
                    <>
                      {/* ⚠️ NO viene preseleccionado ni se guarda solo. Es la
                          misma regla que «Cargar»: un acto sobre el histórico se
                          decide, no se confirma por inercia. */}
                      <button type="button" className="boton" disabled={guardando}
                        onClick={() => void guardar()}>
                        {guardando ? 'Guardando…' : `Guardar ${nf(registros.length)} registro(s)`}
                      </button>
                      <p className="fine">
                        Compruebe antes lo de arriba: qué línea, qué señal es qué y qué entró.
                        Después de guardar, corregir es volver a cargar — no se borra nada.
                      </p>
                    </>
                  )}
                  {falloGuardar && (
                    <p className="advertencia alerta">
                      <b>No se pudo guardar:</b> {falloGuardar}
                      {/[Pp]ermis|insufficient/.test(falloGuardar) && (
                        <> · Si dice «permisos», falta desplegar las reglas de la base: el código
                          nuevo sin sus reglas da «no hay datos» en vez de «faltan reglas»
                          (`35 · L-22`).</>
                      )}
                    </p>
                  )}
                </div>
              )}
              {veredicto && <ElVeredicto v={veredicto} referencia={referencia} />}
              {operacion && <QueTransporta o={operacion} pico={veredicto!.pico} />}
              {operacion && <LoQueCuesta p={operacion.perdidas} />}
              <EnElTiempo c={enElTiempo} />
              <QueTraeElArchivo filas={disponible} />
              {tablero && <Tablero t={tablero} />}
              {registros.length > 1 && <Tendencia registros={registros} />}
              {registros.length > 0 && <PorLinea registros={registros} />}
              {registros.length > 0 && <MapaDeCalor registros={registros} />}
              {registros.length > 3 && <Distribucion registros={registros} />}
              {registros.length > 0 && (
                <TablaDetallada registros={registros} nombre={cargado.nombre}
                  procedencia={procedenciaDelCsv({
                    nombre: cargado.nombre, hoja: cargado.hoja, cuando: cargado.cuando,
                    lineaAbierta, referencia, veredicto,
                  })} />
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// EL HISTÓRICO GUARDADO — consultar por fecha
// ════════════════════════════════════════════════════════════════════════════
//
// ⚠️ LEE RESÚMENES DIARIOS, NUNCA DÍAS COMPLETOS. Es la mitad del diseño: un año
// de diez líneas son 3.650 resúmenes y 87.600 lecturas horarias. Pedir lo
// segundo para pintar lo primero es lo que convierte un módulo gratis en uno que
// factura (`99 §ADR-088`).

/** Los periodos que él pidió. `dias: null` = desde el principio. */
const PERIODOS = [
  { id: '1', rotulo: 'Últimas 24 h', dias: 1 },
  { id: '7', rotulo: 'Últimos 7 días', dias: 7 },
  { id: '30', rotulo: 'Últimos 30 días', dias: 30 },
  { id: '90', rotulo: 'Últimos 3 meses', dias: 90 },
  { id: 'todo', rotulo: 'Histórico completo', dias: null },
] as const;

const iso = (d: Date) => d.toISOString().slice(0, 10);

function HistoricoGuardado({ sesion, lineaAbierta }: {
  sesion: Omit<SesionDePantalla, 'correo'>;
  lineaAbierta?: string;
}) {
  const [periodo, setPeriodo] = useState<string>('7');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [soloEsta, setSoloEsta] = useState(true);
  const [todasLasFilas, setFilas] = useState<Record<string, unknown>[] | null>(null);
  /**
   * ⚠️ EL TABLERO MIRA UN SOLO ESTADÍSTICO (`99 §ADR-112`). Desde que el mismo
   * día se puede guardar tres veces —máximo, promedio e instantáneo—, mezclarlos
   * aquí haría cuatro daños a la vez: contaría 3 días donde hay 1, promediaría
   * medias de naturalezas distintas, picaría la serie un 5 % en la frontera
   * entre tramos cargados de un modo y de otro, y dejaría «horas en sobrecarga»
   * sin significado. Se filtra EN MEMORIA, no en la consulta: filtrar en
   * Firestore exigiría un índice compuesto nuevo, y el emulador no lo exige —
   * saldría verde en local y rojo solo en producción.
   */
  const [verEstadistico, setVerEstadistico] = useState<string>('maximo');
  /**
   * EL DÍA ABIERTO — sus 24 horas, leídas de la base (`99 §ADR-115`).
   *
   * ⚠️ POR QUÉ FALTABA. `diaCompleto` y `desempaquetarDia` existían, probadas, y
   * **ninguna pantalla las llamaba**: las gráficas de las magnitudes solo se
   * dibujaban con el archivo recién leído, en la memoria del navegador. Al
   * recargar, el dato seguía en la base y la pantalla no lo enseñaba. Es
   * exactamente `30 · L-28`: un módulo que ninguna pantalla llama es invisible.
   *
   * Se lee UN día, y solo cuando se pide: es la consulta cara (24 horas frente a
   * un resumen) y por eso no se hace sola al listar el periodo.
   */
  const [horasDelPeriodo, setHorasDelPeriodo] = useState<Registro[] | null>(null);
  const [abriendo, setAbriendo] = useState(false);
  const [falloAbrir, setFalloAbrir] = useState<string | null>(null);
  const [recortadoHoras, setRecortadoHoras] = useState<number | null>(null);

  /**
   * ⚠️ EL PERIODO TRAE SUS HORAS (`99 §ADR-120`). Orden del Ingeniero: «no le
   * veo valor a esta parte, primero hay que darle clic para que se puedan
   * ilustrar los valores… ahí debes permitirme seleccionar la franja de tiempo
   * que quiero apreciar para cada una de las variables».
   *
   * Antes había una TABLA de días con un botón «Abrir» por fila: la forma de la
   * base de datos, no la de su pregunta. Él no audita documentos de uno en uno;
   * mira el comportamiento de la línea en una franja. Así que el selector de
   * periodo manda y las gráficas se dibujan sobre TODO lo elegido, sin un clic.
   */
  const traerHoras = async (fechas: string[], linea: string, est: string) => {
    if (!fechas.length) { setHorasDelPeriodo(null); return; }
    setAbriendo(true); setFalloAbrir(null); setRecortadoHoras(null);
    try {
      const r = await diasCompletos(
        { linea, fechas, estadistico: est as never }, sesion as never,
      );
      const horas = r.dias
        .flatMap((d) => desempaquetarDia(d as never) as unknown as Registro[])
        .sort((a, b) => `${a.fecha} ${String(a.hora).padStart(2, '0')}`
          .localeCompare(`${b.fecha} ${String(b.hora).padStart(2, '0')}`));
      setHorasDelPeriodo(horas);
      if (r.recortado) setRecortadoHoras(r.tope);
    } catch (e) {
      setFalloAbrir((e as Error).message); setHorasDelPeriodo(null);
    } finally { setAbriendo(false); }
  };
  const estadisticosGuardados = useMemo(
    () => [...new Set((todasLasFilas ?? []).map((f) => (f.estadistico as string) ?? 'maximo'))],
    [todasLasFilas],
  );
  const filas = useMemo(
    () => (todasLasFilas ?? []).filter((f) => ((f.estadistico as string) ?? 'maximo') === verEstadistico),
    [todasLasFilas, verEstadistico],
  );
  const [recortado, setRecortado] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  const rango = () => {
    if (periodo === 'rango') return { desde, hasta };
    const p = PERIODOS.find((x) => x.id === periodo)!;
    const fin = new Date();
    // «Desde el principio» no se escribe como una fecha inventada: se pide desde
    // el año 2000, que es antes de que exista un solo dato de este sistema.
    const ini = p.dias == null ? new Date('2000-01-01')
      : new Date(fin.getTime() - (p.dias - 1) * 86400000);
    return { desde: iso(ini), hasta: iso(fin) };
  };

  const consultar = async (forzado?: { desde: string; hasta: string }) => {
    const r = forzado ?? rango();
    if (!r.desde || !r.hasta) { setFallo('faltan las dos fechas del rango'); return; }
    setBuscando(true); setFallo(null);
    try {
      const res = await resumenesEntre(
        { ...r, lineas: soloEsta && lineaAbierta ? [lineaAbierta] : [] },
        { uid: sesion.uid, orgId: sesion.orgId },
      );
      setFilas(res.resumenes);
      setRecortado(res.recortado);
    } catch (e) {
      setFallo((e as Error).message);
      setFilas(null);
    } finally { setBuscando(false); }
  };

  /**
   * ⚠️ AL ABRIR SE ENSEÑA LO QUE HAY (`99 §ADR-116`).
   *
   * Esta pantalla abría en «últimos 7 días» y esperaba a que alguien pulsara
   * «Consultar». El primer dato real del Ingeniero es del **2026-01-01**, ocho
   * meses atrás: al entrar leía *«No existen registros de cargabilidad para el
   * periodo seleccionado»* — **teniéndolos**. Estuvo tres días buscando sus
   * gráficas en una pantalla que le afirmaba que no había nada.
   *
   * Así que primero se pregunta de cuándo es el dato más nuevo —UNA lectura— y,
   * si la ventana por defecto no lo alcanza, se abre el histórico completo y se
   * DICE por qué. Una ventana que esconde el único dato que hay no es un ajuste
   * cómodo: es una pantalla que miente.
   */
  const [ultimoGuardado, setUltimoGuardado] = useState<string | null | undefined>(undefined);
  const [ampliado, setAmpliado] = useState(false);
  const [falloAuto, setFalloAuto] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const dia = await ultimoDiaGuardado(
          { uid: sesion.uid, orgId: sesion.orgId },
          { linea: soloEsta && lineaAbierta ? lineaAbierta : undefined },
        );
        if (!vivo) return;
        setUltimoGuardado(dia);
        if (!dia) return;                       // nada guardado: la pantalla ya lo dice
        const v = rango();
        if (dia < v.desde || dia > v.hasta) {
          setPeriodo('todo'); setAmpliado(true);
          await consultar({ desde: '2000-01-01', hasta: v.hasta });
        } else {
          await consultar(v);
        }
      } catch (e) {
        // ⚠️ NO SE TRAGA. La primera versión llevaba un `catch` vacío «por si
        // acaso», y cuando falló de verdad la pantalla se quedó exactamente
        // igual que antes: sin dato, sin gráficas y sin motivo. Media hora
        // buscando en la consola algo que nadie había escrito. Un fallo que no
        // se dice es un fallo que se investiga dos veces (`§ADR-116`).
        if (vivo) setFalloAuto((e as Error).message);
      }
    })();
    return () => { vivo = false; };
    // Solo al abrir y al cambiar de línea: es UNA lectura, no una por tecla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineaAbierta, soloEsta]);

  /**
   * ⚠️ CON UN SOLO DÍA, SE ABRE SOLO (`99 §ADR-116`).
   *
   * «No veo gráficas de nada» fue el aviso, tres veces. Con la consulta ya
   * resuelta y UN único día en el periodo, dejar las gráficas detrás de un botón
   * es dejarlas escondidas: no hay nada que elegir. Se abre. Con varios días no
   * —abrir el primero por su cuenta sería decidir por él cuál mira, y cada día
   * cuesta una lectura de 24 horas.
   */
  useEffect(() => {
    if (!filas || !filas.length) { setHorasDelPeriodo(null); return; }
    const lineas = [...new Set(filas.map((f) => String(f.linea)))];
    // Con más de una línea no se mezclan series: se pide elegir. Hoy hay una.
    if (lineas.length !== 1) { setHorasDelPeriodo(null); return; }
    void traerHoras(filas.map((f) => String(f.fecha)), lineas[0], verEstadistico);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, verEstadistico]);

  const r = rango();
  const conMedida = (filas ?? []).filter((f) => f.maxima_pct != null);
  const pico = conMedida.length
    ? conMedida.reduce((a, b) => ((b.maxima_pct as number) > (a.maxima_pct as number) ? b : a))
    : null;

  return (
    <div className="tarjeta">
      <p className="mapa-capas-t">El histórico guardado</p>
      <div className="acciones" role="group" aria-label="Periodo">
        {PERIODOS.map((p) => (
          <button key={p.id} type="button"
            className={'boton chico' + (periodo === p.id ? ' activo' : '')}
            aria-pressed={periodo === p.id} onClick={() => setPeriodo(p.id)}>{p.rotulo}</button>
        ))}
        <button type="button" className={'boton chico' + (periodo === 'rango' ? ' activo' : '')}
          aria-pressed={periodo === 'rango'} onClick={() => setPeriodo('rango')}>Entre dos fechas</button>
      </div>
      {periodo === 'rango' && (
        <div className="acciones">
          <label className="mapa-tiempo-dia"><span>Desde</span>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
          <label className="mapa-tiempo-dia"><span>Hasta</span>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
        </div>
      )}
      {lineaAbierta && (
        <label>
          <input type="checkbox" checked={soloEsta} onChange={(e) => setSoloEsta(e.target.checked)} />
          {' '}Solo <b>{lineaAbierta}</b>
        </label>
      )}
      <p className="mapa-capas-n">
        <button type="button" className="boton" disabled={buscando} onClick={() => void consultar()}>
          {buscando ? 'Consultando…' : 'Consultar'}
        </button>
        {' '}<span className="fine">del {r.desde} al {r.hasta}</span>
      </p>

      {fallo && <p className="advertencia alerta"><b>No se pudo consultar:</b> {fallo}</p>}

      {/* ⚠️ «No hay» se DICE, con la fecha que se pidió. Una tabla vacía sin
          frase se lee como que la pantalla está rota. */}
      {filas && filas.length === 0 && (
        <p className="advertencia">
          <b>No existen registros de cargabilidad para el periodo seleccionado</b> ({r.desde} al{' '}
          {r.hasta}{soloEsta && lineaAbierta ? `, línea ${lineaAbierta}` : ''}).
        </p>
      )}

      {/* ⚠️ QUÉ ESTADÍSTICO SE ESTÁ MIRANDO (`99 §ADR-112`). Va ARRIBA y en la
          propia tarjeta, no escondido en un desplegable: un tablero que mezcla
          máximos con promedios no enseña ninguna magnitud real, y la diferencia
          —un 5 % en la corriente— es de las que mueven un veredicto. */}
      {estadisticosGuardados.length > 1 && (
        <div className="acciones" role="group" aria-label="Qué estadístico se está mirando">
          {ESTADISTICOS.filter((e) => estadisticosGuardados.includes(e.id)).map((e) => (
            <button key={e.id} type="button"
              className={'boton chico' + (verEstadistico === e.id ? ' activo' : '')}
              aria-pressed={verEstadistico === e.id}
              onClick={() => setVerEstadistico(e.id)}>{e.rotulo}</button>
          ))}
        </div>
      )}
      {todasLasFilas && todasLasFilas.length > 0 && filas.length === 0 && (
        <p className="advertencia">
          Hay días guardados en este periodo, pero ninguno con el estadístico{' '}
          <b>{ESTADISTICOS.find((e) => e.id === verEstadistico)?.rotulo ?? verEstadistico}</b>.
          Los que hay son: {estadisticosGuardados.map((e) => ESTADISTICOS.find((x) => x.id === e)?.rotulo ?? e).join(' · ')}.
        </p>
      )}

      {falloAuto && (
        <p className="advertencia">
          <b>No se pudo mirar solo qué hay guardado:</b> {falloAuto}. Use los botones de periodo y
          «Consultar» a mano; el dato no se ha perdido.
        </p>
      )}
      {ampliado && ultimoGuardado && (
        <p className="fine">
          Su dato más reciente es del <b>{ultimoGuardado}</b>, así que la ventana de siempre
          —últimos 7 días— no lo alcanzaba. Se abrió el <b>histórico completo</b> para que lo vea.
        </p>
      )}

      {filas && filas.length > 0 && (
        <>
          <p className="mapa-capas-n">
            <b>{nf(filas.length)} día(s)</b> con dato ·{' '}
            <b>{ESTADISTICOS.find((e) => e.id === verEstadistico)?.rotulo ?? verEstadistico}</b>{' '}
            de cada hora · pico del periodo{' '}
            {pico
              ? <><b style={{ color: tintaDe(pico.maxima_pct as number) }}>
                {nf(pico.maxima_pct as number, 1)} %</b> el {String(pico.fecha)} en{' '}
                {String(pico.linea)}</>
              : <b>sin medida</b>}
          </p>
          {/* ⚠️ LAS GRÁFICAS VAN AQUÍ, no solo en la carga recién leída. Durante
              una versión entera el histórico solo tuvo tabla: quien abría la
              pantalla sin cargar un archivo —que son casi todos los días— no
              veía una sola gráfica, y el módulo parecía no tenerlas
              (`32 · L-76`). Se pintan de lo que YA está en memoria: estos
              resúmenes diarios, sin una lectura más a la base. */}
          {/* ⚠️ LAS GRÁFICAS DEL PERIODO, ANTES QUE LA TABLA (`99 §ADR-120`).
              Es lo que él viene a ver: el comportamiento de cada variable en la
              franja que eligió arriba. La tabla de días queda debajo como
              resumen, no como camino al dato. */}
          {abriendo && <p className="fine">Trayendo las horas del periodo…</p>}
          {falloAbrir && <p className="advertencia">No se pudieron traer las horas: {falloAbrir}</p>}
          {horasDelPeriodo && horasDelPeriodo.length > 0 && (
            <>
              <p className="mapa-capas-n">
                <b>{nf(horasDelPeriodo.length)}</b> horas del periodo, leídas de la base —{' '}
                <b>{ESTADISTICOS.find((e) => e.id === verEstadistico)?.rotulo ?? verEstadistico}</b>{' '}
                de cada hora. Cambie el estadístico o el periodo arriba y las gráficas se rehacen.
                {recortadoHoras != null && (
                  <> ⚠️ <b>Se trajeron los {nf(recortadoHoras)} días más recientes</b> del periodo:
                  cada día son 24 lecturas y el plan es gratuito. Acote el periodo para ver el resto.</>
                )}
              </p>
              <GraficasPorFase registros={horasDelPeriodo} />
              <FasesDeLaCarga registros={horasDelPeriodo} />
            </>
          )}
          <TableroDelHistorico resumenes={filas} />
          <TendenciaDiaria resumenes={filas} />
          <PorLineaDelHistorico resumenes={filas} />

          {/* ⚠️ Si se recortó, se dice. Enseñar 1.200 de 3.000 días sin avisar
              haría creer que se vio el total del histórico. */}
          {recortado && (
            <p className="advertencia">
              <b>Se recortó la consulta.</b> Hay más días de los que caben de una vez; se muestran
              los primeros. Acote el periodo o filtre por una línea para verlo entero.
            </p>
          )}
          <div className="tabla-scroll">
            <table className="tabla">
              <thead><tr><th>Fecha</th><th>Línea</th><th>Máxima</th><th>Promedio</th>
                <th>Mínima</th><th>Corriente máx.</th><th>Horas con dato</th>
                <th>Sobrecarga</th></tr></thead>
              <tbody>
                {filas.slice(0, 60).map((f, i) => (
                  <tr key={i}>
                    <td>{String(f.fecha)}</td>
                    <td>{String(f.linea)}</td>
                    <td style={{ color: tintaDe(f.maxima_pct as number ?? null) }}>
                      {f.maxima_pct == null ? 'sin medida' : `${nf(f.maxima_pct as number, 1)} %`}
                    </td>
                    <td>{f.promedio_pct == null ? '—' : `${nf(f.promedio_pct as number, 1)} %`}</td>
                    <td>{f.minima_pct == null ? '—' : `${nf(f.minima_pct as number, 1)} %`}</td>
                    <td>{f.corrienteMaxima_A == null
                      ? '—'
                      : `${nf(f.corrienteMaxima_A as number, 0)} A`}</td>
                    <td>{nf((f.horasConDato ?? f.horasConMedida) as number)} de 24</td>
                    <td>{nf((f.porBanda as Record<string, number>)?.sobrecarga ?? 0)} h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filas.length > 60 && (
            <p className="fine">Se muestran 60 de {nf(filas.length)} días.</p>
          )}

          {horasDelPeriodo && horasDelPeriodo.length === 0 && !abriendo && (
            <p className="advertencia">
              De este periodo no hay ninguna hora guardada con el estadístico <b>
                {ESTADISTICOS.find((e) => e.id === verEstadistico)?.rotulo ?? verEstadistico}
              </b>. Los resúmenes de la tabla sí existen; las 24 horas de ese estadístico, no.
              Pruebe con otro estadístico de los de arriba.
            </p>
          )}
        </>
      )}
      <p className="fine">
        La tabla de arriba sale de <b>resúmenes diarios</b> —una lectura por día en vez de 24—, y las
        gráficas de las <b>horas</b> de esos mismos días. Por eso el periodo se acota: cada día
        dibujado son 24 lecturas.
      </p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// LAS GRÁFICAS DEL HISTÓRICO GUARDADO
// ────────────────────────────────────────────────────────────────────────────
// ⚠️ SON DISTINTAS DE LAS DE LA CARGA, y tienen que serlo. Las de abajo
// (`Tendencia`, `PorLinea`, `MapaDeCalor`) dibujan registros HORARIOS: un punto
// por instante medido. Aquí la unidad es el DÍA, porque el histórico guarda un
// resumen diario y no las 24 horas — que es lo que mantiene el módulo dentro del
// plan gratuito (`99 §ADR-088`). Pintar esto con las de arriba obligaría a abrir
// los días completos, o sea a pagar por lo mismo que se ve gratis.
//
// ⚠️ Y NO CUESTAN UNA LECTURA MÁS: se pintan de los resúmenes que la consulta ya
// trajo a memoria. Añadir gráficas no añadió factura.
// ════════════════════════════════════════════════════════════════════════════

type ResumenDiario = Record<string, unknown>;

/** Cómo se llama cada magnitud en la frase de «de qué está hecho el dato». */
const MAGNITUDES_ROTULO: [string, string][] = [
  ['cargabilidad_pct', 'porcentaje'], ['corriente_A', 'corriente'], ['tension_kV', 'tensión'],
  ['potenciaActiva_MW', 'activa'], ['potenciaReactiva_MVAr', 'reactiva'],
  ['potenciaAparente_MVA', 'aparente'],
];

function TableroDelHistorico({ resumenes }: { resumenes: ResumenDiario[] }) {
  const t = useMemo(() => resumenDelHistorico(resumenes as never[]), [resumenes]);
  const cifra = (v: number | null | undefined, u = ' %') => (v == null ? '—' : `${nf(v, 1)}${u}`);
  return (
    <div className="tarjeta">
      <p className="mapa-capas-t">El periodo guardado, de un vistazo</p>
      <div className="kpis">
        <Kpi v={cifra(t.pico?.pct)} r="Pico del periodo"
          s={t.pico ? `${t.pico.linea} · ${t.pico.fecha}` : undefined}
          color={tintaDe(t.pico?.pct ?? null)} />
        <Kpi v={cifra(t.promedio)} r="Promedio del periodo"
          s="ponderado por horas medidas" color={tintaDe(t.promedio)} />
        <Kpi v={cifra(t.valle?.pct)} r="Valle del periodo"
          s={t.valle ? `${t.valle.linea} · ${t.valle.fecha}` : undefined} />
        <Kpi v={t.lineaMasCargada?.linea ?? '—'} r="Línea con mayor pico"
          s={t.lineaMasCargada?.maximo != null ? `${nf(t.lineaMasCargada.maximo, 1)} %` : undefined} />
        {/* ⚠️ EL PICO QUE SÍ EXISTE. Un día de solo corriente y tensión no tiene
            porcentaje —hace falta la capacidad nominal para calcularlo—, así que
            las tres primeras cifras salen «—» con razón. Pero la corriente del
            pico sí está, y es la que decide el veredicto de ampacidad: durante
            tres decisiones se calculó, se guardó y no se enseñó (`99 §ADR-110`). */}
        {t.picoDeCorriente && (
          <Kpi v={`${nf(t.picoDeCorriente.A, 0)} A`} r="Corriente del pico"
            s={`${t.picoDeCorriente.linea} · ${t.picoDeCorriente.fecha}`
              + (t.picoDeCorriente.hora ? ` · ${t.picoDeCorriente.hora}:00` : '')} />
        )}
        <Kpi v={nf(t.dias)} r="Días guardados"
          s={t.diasConMedida !== t.dias ? `${nf(t.diasConMedida)} con porcentaje` : undefined} />
        <Kpi v={nf(t.lineas)} r="Líneas en el periodo" />
        <Kpi v={nf(t.diasConSobrecarga)} r="Días con sobrecarga"
          s={t.horasDeSobrecarga > 0 ? `${nf(t.horasDeSobrecarga)} h en total` : '≥ 100 %'}
          color={t.diasConSobrecarga > 0 ? 'var(--tx-alerta)' : undefined} />
        <Kpi v={cifra(t.cobertura_pct)} r="Cobertura horaria"
          s="de las 24 h de cada día guardado" />
      </div>
      <div className="bandas-reparto">
        {BANDAS.map((b) => (
          <span key={b.clave} className="banda-chip">
            <i style={{ background: RELLENO_BANDA[b.clave] }} /> {b.rotulo}:{' '}
            <b>{nf(t.porBanda[b.clave] ?? 0)}</b> h
          </span>
        ))}
      </div>
      {/* ⚠️ DE QUÉ ESTÁ HECHO EL PROMEDIO. Un promedio de 24 horas medidas y uno
          de 6 medidas + 18 calculadas por nosotros NO son la misma cifra, y
          durante una versión entera se guardaron indistinguibles. */}
      {(t.porNaturaleza.declarada + t.porNaturaleza.derivada + t.porNaturaleza.sinDeclarar) > 0 && (
        <p className="fine">
          De las {nf(t.horasConMedida)} horas con medida: <b>{nf(t.porNaturaleza.declarada)}</b>{' '}
          venían en el archivo y <b>{nf(t.porNaturaleza.derivada)}</b> las calculó este sistema
          dividiendo la corriente por la capacidad nominal.
          {t.porNaturaleza.sinDeclarar > 0 && (
            <> {nf(t.porNaturaleza.sinDeclarar)} no declaran de dónde salen.</>
          )}
        </p>
      )}
      {t.diasSinSello > 0 && (
        <p className="advertencia">
          <b>{nf(t.diasSinSello)} de estos días se guardaron antes del sello</b> y no dicen con qué
          versión del motor se produjeron: no son estrictamente comparables con los posteriores. No
          se han reescrito a propósito — ponerles un sello que nadie estampó sería inventarlo.
        </p>
      )}
      {/* ⚠️ DE QUÉ ESTÁ HECHO EL «DATO». Sin esto, un periodo con 24 h de
          corriente y tensión pero sin porcentaje se leía como vacío — el tablero
          negando el dato que resumía (`99 §ADR-110`). */}
      {t.horasConDato > 0 && (
        <p className="fine">
          Las <b>{nf(t.horasConDato)}</b> horas con dato traen:{' '}
          {MAGNITUDES_ROTULO.filter(([m]) => (t.porMagnitud[m] ?? 0) > 0)
            .map(([m, rot]) => `${rot} ${nf(t.porMagnitud[m])} h`).join(' · ') || '—'}.
          {t.diasSinRecuentoPorMagnitud > 0 && (
            <> {nf(t.diasSinRecuentoPorMagnitud)} día(s) se guardaron antes de que el resumen
            contara magnitudes y no dicen de qué eran: no se les supone cero.</>
          )}
        </p>
      )}
      <p className="fine">
        Del <b>{t.desde ?? '—'}</b> al <b>{t.hasta ?? '—'}</b>. La cobertura se mide contra los días
        que HAY guardados, no contra el calendario que usted pidió: tres días completos son 100 %,
        no «el 10 % de un mes». Y cuenta las horas con <b>cualquier</b> magnitud, no solo las que
        traen porcentaje.
      </p>
      <Sello />
    </div>
  );
}

function TendenciaDiaria({ resumenes }: { resumenes: ResumenDiario[] }) {
  const lineas = useMemo(
    () => [...new Set(resumenes.map((s) => String(s.linea)))].sort(), [resumenes]);
  const [cual, setCual] = useState<string>('');
  const serie = useMemo(
    () => serieDiaria(resumenes as never[], cual || null), [resumenes, cual]);

  const techo = techoY(serie.map((p) => p.maxima_pct ?? 0));
  const franjas = areasDeBanda(
    serie.map((p) => ({ alto: p.maxima_pct, bajo: p.minima_pct })), techo);
  const deMaxima = tramosDeLinea(serie.map((p) => ({ pct: p.maxima_pct })), techo);
  const dePromedio = tramosDeLinea(serie.map((p) => ({ pct: p.promedio_pct })), techo);
  const idx = marcasX(serie.length);

  if (!serie.length) return null;

  return (
    <div className="tarjeta">
      <p className="mapa-capas-t">Día a día, en el histórico</p>
      <label className="mapa-tiempo-dia">
        <span>Línea</span>
        <select value={cual} onChange={(e) => setCual(e.target.value)}>
          <option value="">Todas — cada día, la más cargada</option>
          {lineas.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </label>

      <svg viewBox={`0 0 ${LIENZO.ancho} ${LIENZO.alto}`} className="grafica" role="img"
        aria-label={`Cargabilidad día a día${cual ? ` de ${cual}` : ''}`}>
        {marcasY(techo).map((v) => (
          <g key={v}>
            <line x1={LIENZO.margen.i} x2={LIENZO.ancho - LIENZO.margen.d}
              y1={y(v, techo)} y2={y(v, techo)} stroke="var(--bd-tenue)" strokeWidth={1} />
            <text x={LIENZO.margen.i - 6} y={y(v, techo) + 4} textAnchor="end"
              fontSize={10} fill="var(--tx-tenue, #888)">{v}</text>
          </g>
        ))}
        {/* La franja es el RECORRIDO del día: sin ella, un punto al 60 % se lee
            igual viniendo de un día plano que de uno que osciló de 20 a 104. */}
        {franjas.map((puntos, i) => (
          <polygon key={`f${i}`} points={puntos} fill="var(--acc)" opacity={0.14} />
        ))}
        {REFERENCIAS.filter((v) => v <= techo).map((v) => (
          <g key={`r${v}`}>
            <line x1={LIENZO.margen.i} x2={LIENZO.ancho - LIENZO.margen.d}
              y1={y(v, techo)} y2={y(v, techo)} strokeDasharray="5 3" strokeWidth={1.4}
              stroke={TINTA_BANDA[bandaDe(v)!.clave]} />
            <text x={LIENZO.ancho - LIENZO.margen.d} y={y(v, techo) - 4} textAnchor="end"
              fontSize={10} fill={TINTA_BANDA[bandaDe(v)!.clave]}>{v} %</text>
          </g>
        ))}
        {dePromedio.map((puntos, i) => (
          <polyline key={`p${i}`} points={puntos} fill="none" stroke="var(--tx3)"
            strokeWidth={1.2} strokeDasharray="4 3" strokeLinejoin="round" />
        ))}
        {deMaxima.map((puntos, i) => (
          <polyline key={`m${i}`} points={puntos} fill="none" stroke="var(--acc)"
            strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {serie.map((p, i) => (
          <circle key={i} cx={x(i, serie.length)} cy={y(p.maxima_pct ?? 0, techo)} r={2.6}
            fill={tintaDe(p.maxima_pct)}>
            <title>
              {etiquetaInstante({ fecha: p.fecha, hora: null })} · {p.linea} · máxima{' '}
              {nf(p.maxima_pct ?? 0, 1)} %{p.promedio_pct != null
                ? ` · promedio ${nf(p.promedio_pct, 1)} %` : ''}
              {p.minima_pct != null ? ` · mínima ${nf(p.minima_pct, 1)} %` : ''}
              {' '}· {nf(p.horasConMedida)} h medidas
            </title>
          </circle>
        ))}
        {idx.map((i) => (
          <text key={i} x={x(i, serie.length)} y={LIENZO.alto - 10} textAnchor="middle"
            fontSize={9} fill="var(--tx-tenue, #888)">
            {etiquetaInstante({ fecha: serie[i].fecha, hora: null })}
          </text>
        ))}
      </svg>

      <p className="fine">
        <b>{nf(serie.length)} día(s)</b> · la línea llena es la <b>máxima</b> de cada día, la
        punteada su <b>promedio</b>, y la franja el recorrido entre mínima y máxima. Sin línea
        elegida, cada día muestra <b>la línea más cargada de ese día</b> — no el promedio de todas,
        que escondería justo el día que hay que mirar. Un día sin medir parte la línea: no se une
        con una recta que nadie midió.
      </p>
    </div>
  );
}

function PorLineaDelHistorico({ resumenes }: { resumenes: ResumenDiario[] }) {
  const filas = useMemo(() => porLineaDesdeResumenes(resumenes as never[]), [resumenes]);
  const techo = techoY(filas.map((f) => f.maximo ?? 0));
  if (filas.length < 2) return null;   // con una sola línea, un ranking no dice nada

  return (
    <div className="tarjeta">
      <p className="mapa-capas-t">Por línea en el periodo, por su pico</p>
      <div className="barras">
        {filas.map((f) => (
          <div key={f.linea} className="barra-fila">
            <span className="barra-rotulo" title={f.linea}>{f.linea}</span>
            <span className="barra-pista">
              <span className="barra-valor" style={{
                width: `${Math.min(100, ((f.maximo ?? 0) / techo) * 100)}%`,
                background: tintaDe(f.maximo),
              }} />
            </span>
            <span className="barra-cifra">
              {f.maximo == null ? '—' : `${nf(f.maximo, 1)} %`}
              {f.horasDeSobrecarga > 0 && (
                <span className="fine" title="horas por encima del 100 %">
                  {' '}· {nf(f.horasDeSobrecarga)}⚠
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
      <p className="fine">
        {nf(filas.length)} línea(s) · la barra es el <b>pico</b> del periodo, no su promedio: para
        decidir si una línea aguanta, lo que importa es a cuánto llegó. El número tras el ⚠ son las
        horas por encima del 100 %.
      </p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// LA EXPORTACIÓN DE SCADA — el tiempo en columnas, cada magnitud en su fila
// ════════════════════════════════════════════════════════════════════════════
//
// Aquí se piden las TRES cosas que el archivo no dice y el sistema no puede
// deducir sin arriesgarse: de qué línea es, qué señal es qué magnitud, y con qué
// criterio se juntan las tres fases. Ninguna viene decidida de fábrica.
// El umbral de las tres fases —`FASES_POR_MAGNITUD`— y su cuenta viven en el
// NÚCLEO desde el `§ADR-127`, con prueba de oro: aquí se contaban solo sobre el
// primer día de la carga (`99 §ADR-105/117/127`).

/** Por encima de esto, la gráfica dibuja la línea sin marcar cada instante. */
const PUNTOS_VISIBLES = 120;

/** Filas de la tabla hora a hora antes de recortar y DECIRLO. */
const FILAS_TABLA = 200;

function SenalesDelScada({
  cargado, ancho, linea, alCambiarLinea, lineaAbierta, criterioFase, alCambiarCriterio,
  asignado, alAsignar, porArchivo, presentes, verAhora, alMirar, alCorregir,
}: {
  cargado: Cargado;
  ancho: ReturnType<typeof registrosDeVariosDias> | null;
  linea: string; alCambiarLinea: (v: string) => void; lineaAbierta?: string;
  criterioFase: string; alCambiarCriterio: (v: string) => void;
  asignado: Record<string, string | null>;
  alAsignar: (a: Record<string, string | null>) => void;
  porArchivo: { nombre: string; senales: number; estadistico: string | null; porQue: string; resuelto: string | null }[];
  presentes: string[];
  verAhora: string | null;
  alMirar: (v: string) => void;
  alCorregir: (nombre: string, v: string) => void;
}) {
  // ⚠️ LAS SEÑALES DE LA CARGA ENTERA, no las del primer día (`99 §ADR-127`).
  // Medido sobre enero: el primer día trae 23 y la carga 32 —el mínimo no empieza
  // hasta el 13—. Las que faltaban no se podían ver, ni volver a usar si la
  // carga nacía en «no usar».
  const senales = ancho?.senalesDeLaCarga ?? [];
  const ceros = ancho ? cerosAlFinal(ancho.senales, ancho.eje) : null;
  // Fases DISTINTAS: la lista trae cada señal una vez por estadístico, y contar
  // señales diría «las 12 fases» con cuatro estadísticos de tres corrientes.
  const fases = new Set(senales.filter((s) => s.campo === 'corriente_A' && s.fase).map((s) => s.fase)).size;

  /**
   * ⚠️ BUSCAR ENTRE LAS SEÑALES, y no es cosmética (`99 §ADR-105`). Una
   * exportación real del sistema de supervisión no trae tres filas: trae **toda
   * la red**. Los archivos del 2026-01-01 traen 7.302 señales entre los tres, y
   * de esas al Ingeniero le importan TRES. Pintarlas todas cuelga la pantalla y,
   * peor, esconde las suyas en un pajar.
   *
   * Se filtra por texto sobre la etiqueta —la subestación, la bahía, la
   * magnitud— y se DICE cuántas quedan fuera. Un tope que no se anuncia se lee
   * como «esto es todo lo que hay», que es justo la mentira que no se quiere.
   */
  const [busca, setBusca] = useState('');
  const TOPE_SENALES = 60;
  const q = busca.trim().toLowerCase();
  const casan = q
    ? senales.filter((s) => s.etiqueta.toLowerCase().includes(q))
    : senales;
  const visibles = casan.slice(0, TOPE_SENALES);
  const usadas = senales.filter((s) => s.campo).length;

  return (
    <div className="tarjeta">
      <p className="mapa-capas-t">Este archivo viene de SCADA</p>
      <p className="mapa-capas-n">
        No es una tabla: es una <b>matriz transpuesta</b> — {cargado.porQue}. Se lee tal cual, sin
        que usted tenga que reescribirla.
      </p>
      {/* ⚠️ CÓMO SE LEYÓ LA FECHA, dicho (`99 §ADR-127`). El núcleo lo apuntaba
          —«se ENSEÑA», dice su comentario— y la pantalla no lo enseñaba: una
          carga de días del 1 al 12 se leía día/mes sin decir que eso era una
          suposición. Si la carga lo contradice, ni llega aquí: se niega arriba. */}
      {cargado.ordenDeFecha?.aplica && (
        <p className={cargado.ordenDeFecha.seguro ? 'fine' : 'advertencia'}>
          <b>Cómo se leyó la fecha:</b> {cargado.ordenDeFecha.porQue}.
        </p>
      )}

      {/* ── 0 · QUÉ ESTADÍSTICO TRAE CADA ARCHIVO (`99 §ADR-112`) ────────────
          ⚠️ Esto va ANTES que nada, porque es lo que decide QUÉ SE ESCRIBE
          ENCIMA DE QUÉ. La misma magnitud llega tres veces —máximo, promedio e
          instantáneo—, con la MISMA etiqueta de señal, y solo el nombre del
          archivo las distingue. Si un promedio se lee como máximo, se guarda con
          la identidad del máximo y lo REEMPLAZA: el histórico no tiene borrado y
          ese número no vuelve. Por eso se enseña lo que se entendió, archivo por
          archivo, y se puede corregir antes de tocar la base. */}
      <p className="mapa-capas-t" style={{ marginTop: '1rem' }}>Qué trae cada archivo</p>
      <div className="tabla-scroll">
        <table className="tabla">
          <thead><tr><th>Archivo</th><th>Señales</th><th>Se entendió que trae</th></tr></thead>
          <tbody>
            {porArchivo.map((a) => (
              <tr key={a.nombre}>
                <td>{a.nombre}</td>
                <td>{nf(a.senales)}</td>
                <td>
                  <select value={a.resuelto ?? ''} onChange={(e) => alCorregir(a.nombre, e.target.value)}
                    aria-label={`Qué estadístico trae ${a.nombre}`}>
                    <option value="">— no lo dice: elíjalo —</option>
                    {ESTADISTICOS.map((e) => (
                      <option key={e.id} value={e.id}>{e.rotulo}</option>
                    ))}
                  </select>
                  {a.estadistico == null && (
                    <span className="fine"> · {a.porQue}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {porArchivo.some((a) => !a.resuelto) ? (
        <p className="advertencia">
          <b>Falta decir qué estadístico trae {nf(porArchivo.filter((a) => !a.resuelto).length)}{' '}
          archivo(s).</b> No se guardan así: escribir un promedio con la identidad de un máximo lo
          reemplazaría, y el histórico no se puede deshacer. Dígalo arriba y vuelva a guardar.
        </p>
      ) : (
        <p className="fine">
          <b>Máximo</b> es el que dictamina —un límite térmico se comprueba contra el pico, no contra
          la media—; el <b>promedio</b> es el que habilita energía y factor de carga. Al guardar se
          escriben <b>todos</b> los que haya, cada uno en su día: lo de abajo es solo cuál mira ahora.
        </p>
      )}
      {presentes.length > 1 && (
        <div className="acciones" role="group" aria-label="Qué estadístico se está mirando">
          {presentes.map((e) => (
            <button key={e} type="button"
              className={`boton chico${e === verAhora ? ' activo' : ''}`}
              onClick={() => alMirar(e)}>
              {ESTADISTICOS.find((x) => x.id === e)?.rotulo ?? e}
            </button>
          ))}
        </div>
      )}

      {/* ── 1 · DE QUÉ LÍNEA ES ─────────────────────────────────────────── */}
      <label className="mapa-tiempo-dia">
        <span>Línea *</span>
        {/* ⚠️ SIN EJEMPLO. Lo tuvo —«p. ej. LN-627»— y proponía como pista el
            código de una línea REAL del proyecto, justo en la casilla que dos
            párrafos más abajo se declara «lo más caro de equivocar aquí».
            Aceptarlo sin pensar le cuelga a LN-627 la operación de otra línea.
            La única propuesta admisible es la que sale del dato: la línea
            abierta, que se ofrece debajo con un botón (`99 §ADR-091`). */}
        <input type="text" value={linea} onChange={(e) => alCambiarLinea(e.target.value)}
          placeholder="código de la línea a la que pertenecen estas mediciones"
          aria-label="De qué línea es este archivo" />
      </label>
      <p className="fine">
        {lineaAbierta
          ? <>Se propone <b>{lineaAbierta}</b> porque es la línea que tiene abierta. Cámbielo si el
            archivo es de otra: el archivo nombra la subestación y la bahía, no la línea.</>
          : <>El archivo nombra la subestación y la bahía, no la línea. Escríbala usted.</>}
      </p>

      {/* ── 2 · QUÉ SEÑAL ES QUÉ ────────────────────────────────────────── */}
      <p className="mapa-capas-t">Qué señal es qué</p>
      {/* ⚠️ QUÉ DÍA, Y POR QUÉ (`99 §ADR-127`). La revisión mira todos los días,
          así que el aviso tiene que decir CUÁL: «hay más de tres» a secas, en
          un mes de 27 días, obliga a buscarlo a ojo. */}
      {cargado.revision.ambiguo && (
        <p className="advertencia">
          <b>Ninguna señal se usa hasta que usted elija.</b>{' '}
          {nf(new Set(cargado.revision.excesos.map((x) => x.fecha)).size)} día(s) traen más señales
          de las que caben en una magnitud: {cargado.revision.excesos.slice(0, 5).map((x) => x.porQue).join(' · ')}
          {cargado.revision.excesos.length > 5 ? ' · …' : ''}. Si es otra bahía, elija abajo la suya. Si es el
          mismo archivo bajado dos veces —un «(1)»—, quítelo o páselo por el paso 2: dos señales con la
          misma etiqueta no se pueden separar aquí, y juntas pesan doble en el promedio.
        </p>
      )}
      <label className="calc-campo">
        <span>Buscar la señal</span>
        <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="subestación, bahía o magnitud" />
      </label>
      {q && casan.length > 0 && (
        <div className="acciones">
          <button type="button" className="boton chico"
            onClick={() => alAsignar({
              ...asignado,
              ...Object.fromEntries(casan.map((s) => [s.etiqueta, s.propuesta?.campo ?? null])),
            })}>
            Usar las {nf(casan.length)} que casan
          </button>
          {usadas > 0 && (
            <button type="button" className="boton chico"
              onClick={() => alAsignar(Object.fromEntries(senales.map((s) => [s.etiqueta, null])))}>
              Quitar todas
            </button>
          )}
        </div>
      )}
      <p className="fine">
        {nf(senales.length)} señal(es) en la carga · <b>{nf(usadas)}</b> en uso
        {q ? <> · {nf(casan.length)} casan con «{busca.trim()}»</> : null}
        {casan.length > TOPE_SENALES
          ? <> · <b>se enseñan {TOPE_SENALES}</b>, afine la búsqueda para ver el resto</>
          : null}
        . Una exportación de la red entera trae miles y <b>todas</b> se reconocen: por eso, por
        más de {FASES_POR_MAGNITUD} de la misma magnitud y el mismo estadístico —que serían más de
        las tres fases—, ninguna se usa hasta que usted la elija. Combinarlas todas
        no daría error — daría la tensión de media Colombia en un solo número.
      </p>
      <div className="tabla-scroll">
        <table className="tabla">
          <thead><tr><th>Señal del archivo</th><th>Se leyó como</th><th>Primeros valores</th></tr></thead>
          <tbody>
            {visibles.map((s) => (
              <tr key={`${s.estadistico ?? '—'} ${s.etiqueta}`}>
                <td>
                  {s.etiqueta}
                  {/* En cuántos días viene: febrero trae días sin una fase, y eso
                      se lee aquí antes que en una gráfica con un hueco. */}
                  {cargado.porDia.length > 0 && (
                    <span className="fine"> · en {nf(s.fechas.length)} de {nf(cargado.porDia.length)} día(s)</span>
                  )}
                </td>
                <td>
                  {/* ⚠️ POR ETIQUETA (`99 §ADR-127`): lo que se elige aquí vale para
                      esta señal en TODOS los días, y en todos sus estadísticos. */}
                  <select value={s.campo ?? ''}
                    onChange={(e) => alAsignar({ ...asignado, [s.etiqueta]: e.target.value || null })}>
                    <option value="">— no usar —</option>
                    {Object.keys(CAMPOS).filter((c) => CAMPOS[c].tipo === 'numero')
                      .map((c) => (
                        <option key={c} value={c}>
                          {CAMPOS[c].rotulo}{CAMPOS[c].unidad ? ` (${CAMPOS[c].unidad})` : ''}
                        </option>
                      ))}
                  </select>
                  {s.propuesta && !Object.hasOwn(asignado, s.etiqueta) && (
                    <span className="fine"> · {s.propuesta.porQue}</span>
                  )}
                </td>
                <td className="fine">
                  {s.valores.slice(0, 6).map((v: number | null) => (v == null ? '—' : nf(v, 0))).join(' · ')}…
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {senales.some((s) => !s.campo) && (
        <p className="fine">
          Una señal en «no usar» no aporta nada y no estorba. Se dejan así las que no se
          reconocieron: asignar mal una señal no da error, da una gráfica falsa.
        </p>
      )}

      {/* ── 3 · CÓMO SE JUNTAN LAS FASES ────────────────────────────────── */}
      {fases > 1 && (
        <>
          <p className="mapa-capas-t">Las {fases} fases, en un solo número por hora</p>
          <div className="acciones" role="group" aria-label="Criterio para juntar las fases">
            {CRITERIOS_DE_FASE.map((c) => (
              <button key={c.id} type="button"
                className={'boton chico' + (criterioFase === c.id ? ' activo' : '')}
                aria-pressed={criterioFase === c.id} onClick={() => alCambiarCriterio(c.id)}>
                {c.rotulo}
              </button>
            ))}
          </div>
          <p className="fine">
            {CRITERIOS_DE_FASE.find((c) => c.id === criterioFase)?.porQue}
          </p>
        </>
      )}

      {/* ⚠️ EL AVISO QUE NO SE PUEDE CALLAR NI DECIDIR. */}
      {ceros && <p className="advertencia"><b>Ojo con el final del día.</b> {ceros.aviso}</p>}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// DE DÓNDE SALIÓ LA CABECERA — dicho, y corregible
// ════════════════════════════════════════════════════════════════════════════
//
// ⚠️ Existe porque la detección puede fallar, y cuando falla el usuario se queda
// mirando trece «sin asignar» sin saber por qué. Aquí se dice qué fila se tomó y
// se enseñan las primeras filas CRUDAS para que se pueda señalar otra. Sin esto,
// el único camino era salir a arreglar el Excel.
function CabeceraElegida({ cargado, alUsarFila }: {
  cargado: Cargado; alUsarFila: (fila: number) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const primeras = cargado.matriz.slice(0, 12);
  const texto = (c: Celda) => (c == null || String(c).trim() === '' ? '' : String(c).trim());

  return (
    <div className="tarjeta">
      <p className="mapa-capas-t">La cabecera</p>
      <p className="mapa-capas-n">
        Se está usando la <b>fila {cargado.filaCabecera + 1}</b> como cabecera — {cargado.porQue}.{' '}
        <button type="button" className="boton chico" onClick={() => setAbierto(!abierto)}>
          {abierto ? 'Ocultar el principio de la hoja' : '¿No es ésa? Ver el principio de la hoja'}
        </button>
      </p>
      {abierto && (
        <div className="tabla-scroll">
          <table className="tabla">
            <thead>
              <tr><th>Fila</th><th>Contenido</th><th /></tr>
            </thead>
            <tbody>
              {primeras.map((celdas, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{celdas.map(texto).filter((t) => t !== '').join(' · ') || <i>(vacía)</i>}</td>
                  <td>
                    {i === cargado.filaCabecera
                      ? <b>en uso</b>
                      : (
                        <button type="button" className="boton chico" onClick={() => alUsarFila(i)}>
                          Usar ésta
                        </button>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// EL MAPEO — lo primero, y corregible
// ════════════════════════════════════════════════════════════════════════════
function MapeoDeColumnas({ cabeceras, mapeo, alCambiar }: {
  cabeceras: string[]; mapeo: Mapeo; alCambiar: (m: Mapeo) => void;
}) {
  const usadas = new Set(Object.values(mapeo));
  const sinReconocer = cabeceras.filter((c) => !usadas.has(c));
  return (
    <div className="tarjeta">
      <p className="mapa-capas-t">Qué columna es qué</p>
      <p className="mapa-capas-n">
        Se dedujo del nombre de cada columna. <b>Compruébelo antes de mirar un número:</b> una
        columna mapeada mal no da error, da una gráfica bonita y falsa.
      </p>
      <div className="mapeo-rejilla">
        {Object.keys(CAMPOS).map((campo) => (
          <label key={campo} className="mapeo-fila">
            <span>{CAMPOS[campo].rotulo}{CAMPOS[campo].requerido && <b> *</b>}
              {CAMPOS[campo].unidad && <span className="fine"> ({CAMPOS[campo].unidad})</span>}</span>
            <select value={mapeo[campo] ?? ''}
              onChange={(e) => {
                const m = { ...mapeo };
                if (e.target.value) m[campo] = e.target.value; else delete m[campo];
                alCambiar(m);
              }}>
              <option value="">— sin asignar —</option>
              {cabeceras.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        ))}
      </div>
      {sinReconocer.length > 0 && (
        <p className="mapa-capas-n">
          Columnas del archivo sin asignar: <b>{sinReconocer.join(' · ')}</b>. No estorban; si alguna
          es un campo de arriba, asígnela.
        </p>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// QUÉ ENTRÓ Y QUÉ NO
// ════════════════════════════════════════════════════════════════════════════
function ResumenDeLaCarga({ lote, registros, nombre }: {
  lote: { resumen: { filas: number; correctos: number; conError: number } | null;
    errores: { nFila: number | null; campo: string; valor: unknown; porQue: string }[];
    escalaPct: { escala: number | null; porQue: string; ambigua: boolean } | null };
  registros: Registro[]; nombre: string;
}) {
  const { nuevos, repetidosEnElLote } = useMemo(
    () => separarNuevos(registros as never[], new Set()), [registros]);
  const ausentes = useMemo(() => camposAusentes(registros as never[]), [registros]);
  const r = lote.resumen;
  if (!r) return null;

  return (
    <div className="tarjeta">
      <p className="mapa-capas-t">Qué entró</p>
      <p className="mapa-capas-n">
        <b>{nf(r.correctos)}</b> registro(s) correcto(s) de {nf(r.filas)}
        {r.conError > 0 && <> · <b className="tx-alerta">{nf(r.conError)} con error</b></>}
        {repetidosEnElLote.length > 0 && (
          <> · <b>{nf(repetidosEnElLote.length)} repetido(s) dentro del propio archivo</b> (mismo
            instante y misma línea: solo se conserva uno)</>
        )}
        {nuevos.length !== r.correctos && <> · {nf(nuevos.length)} instantes distintos</>}
      </p>

      {/* ⚠️ La escala del % se decide mirando la columna ENTERA. Si es ambigua se
          dice y no se adivina: convertir un 0,8 en 80 % es la diferencia entre
          una línea descargada y una al borde. */}
      {lote.escalaPct?.ambigua ? (
        <p className="advertencia">
          <b>No se pudo decidir la escala del porcentaje:</b> {lote.escalaPct.porQue}. Revise esa
          columna en el archivo — mezcla valores que parecen fracción con otros que parecen ya
          porcentaje, y elegir por usted convertiría un 0,8 % en un 80 %.
        </p>
      ) : (
        <p className="fine">Escala del porcentaje: {lote.escalaPct?.porQue}</p>
      )}

      {r.conError > 0 && (
        <p className="mapa-capas-n">
          <button type="button" className="boton chico"
            onClick={() => descargar(`errores-${nombre.replace(/\.[^.]+$/, '')}.csv`,
              csvDeErrores(lote.errores))}>
            Descargar el informe de errores ({nf(r.conError)})
          </button>
          {' '}Trae la fila del archivo, el campo, el valor que se leyó y por qué no se pudo usar.
        </p>
      )}

      {ausentes.length > 0 && (
        <p className="fine">
          Campos que el archivo no trajo en ninguna fila:{' '}
          {ausentes.map((c) => CAMPOS[c].rotulo).join(' · ')}. Se declaran vacíos, no se rellenan.
        </p>
      )}
    </div>
  );
}

/**
 * LAS FASES, HORA A HORA (`99 §ADR-106`).
 *
 * Orden del Ingeniero: «todas en sus distintas fases». Hasta hoy las tres se
 * resumían en un número con un criterio y la letra se perdía por el camino;
 * ahora se guardan y aquí se VEN, que es la mitad que faltaba.
 *
 * ⚠️ Solo se pinta la magnitud que la carga TRAIGA. Una tabla con seis columnas
 * de guiones no informa de nada y hace creer que faltó algo: si el archivo no
 * trae potencias por fase, esa tabla sencillamente no aparece.
 */
function FasesDeLaCarga({ registros }: { registros: Registro[] }) {
  const [abierto, setAbierto] = useState(false);
  const GRUPOS = [
    { rotulo: 'Tensión entre fases', unidad: 'kV', dec: 1, agregado: 'tension_kV',
      cols: [['RS', 'tensionRS_kV'], ['ST', 'tensionST_kV'], ['TR', 'tensionTR_kV']] as const },
    { rotulo: 'Tensión fase-tierra', unidad: 'kV', dec: 1, agregado: 'tension_kV',
      cols: [['R', 'tensionR_kV'], ['S', 'tensionS_kV'], ['T', 'tensionT_kV']] as const },
    { rotulo: 'Corriente', unidad: 'A', dec: 0, agregado: 'corriente_A',
      cols: [['R', 'corrienteR_A'], ['S', 'corrienteS_A'], ['T', 'corrienteT_A']] as const },
    { rotulo: 'Potencia activa', unidad: 'MW', dec: 2, agregado: 'potenciaActiva_MW',
      cols: [['R', 'potenciaActivaR_MW'], ['S', 'potenciaActivaS_MW'], ['T', 'potenciaActivaT_MW']] as const },
    { rotulo: 'Potencia reactiva', unidad: 'MVAr', dec: 2, agregado: 'potenciaReactiva_MVAr',
      cols: [['R', 'potenciaReactivaR_MVAr'], ['S', 'potenciaReactivaS_MVAr'], ['T', 'potenciaReactivaT_MVAr']] as const },
    { rotulo: 'Potencia aparente', unidad: 'MVA', dec: 2, agregado: 'potenciaAparente_MVA',
      cols: [['R', 'potenciaAparenteR_MVA'], ['S', 'potenciaAparenteS_MVA'], ['T', 'potenciaAparenteT_MVA']] as const },
  ];
  /**
   * ⚠️ TODAS LAS MAGNITUDES, hora a hora — no solo las que traen fases
   * (`99 §ADR-118`). «Las medidas necesito apreciarlas hora a hora», y la
   * activa, la reactiva y la aparente llegan de su SCADA **solo como agregado**:
   * se guardaban bien y no salían en ninguna tabla ni en ninguna gráfica.
   * Cuando hay fases se enseñan las fases; si no, el total, rotulado como total.
   */
  // ⚠️ EL AGREGADO LO RECLAMA UN SOLO GRUPO. «Tensión entre fases» y «tensión
  // fase-tierra» comparten el mismo campo agregado, así que caer al total en los
  // dos pintaba la MISMA línea dos veces, y una de ellas con el rótulo
  // equivocado —«fase a tierra» sobre una medida entre fases, que es el factor
  // de 1,73 que este módulo lleva cuidando desde el principio—. Se queda el
  // primero que lo declara.
  const reclamado = new Set<string>();
  const conDato = GRUPOS
    .map((g) => {
      const fases = g.cols.filter(([, c]) => registros.some((x) => x[c] != null));
      if (fases.length) { reclamado.add(g.agregado); return { ...g, presentes: fases, soloAgregado: false }; }
      const hay = registros.some((x) => x[g.agregado] != null) && !reclamado.has(g.agregado);
      if (hay) reclamado.add(g.agregado);
      return hay
        ? { ...g, presentes: [['total', g.agregado]] as unknown as typeof g.cols, soloAgregado: true }
        : { ...g, presentes: [] as unknown as typeof g.cols, soloAgregado: false };
    })
    .filter((g) => g.presentes.length > 0);
  if (!conDato.length) return null;
  // ⚠️ LAS 24 DE UN DÍA, ENTERAS. «Hora a hora» quiere decir las horas que hay:
  // cortar un día a la mitad obligaba a exportar el CSV para ver la tarde. Un
  // PERIODO largo sí se acota —un mes son 700 filas por magnitud— y se dice.
  const primeras = registros.slice(0, FILAS_TABLA);
  const criterio = registros.find((x) => x.criterioFase)?.criterioFase;

  return (
    <div className="tarjeta">
      {/* ⚠️ PLEGADA POR DEFECTO, orden del Ingeniero (`99 §ADR-117`): «prefiero
          que sea desplegable, me interesa que se aprecien más las gráficas».
          Son 24 filas por magnitud y empujaban las gráficas fuera de la
          pantalla. Se pliega la TABLA, no el dato: el número sigue estando a un
          clic, y el rótulo dice cuántas horas hay dentro para que plegado no se
          confunda con vacío. */}
      <p className="mapa-capas-t">
        Las fases, hora a hora{' '}
        <button type="button" className="boton chico" aria-expanded={abierto}
          onClick={() => setAbierto(!abierto)}>
          {abierto ? 'Ocultar la tabla' : `Ver las ${nf(registros.length)} horas`}
        </button>
      </p>
      <p className="fine">
        Lo que trae la carga, sin resumir. El valor agregado que usa el resto de la pantalla sale de
        estas tres{criterio ? <> con el criterio <b>{criterio === 'maxima' ? 'la fase más cargada' : 'el promedio de las tres'}</b></> : null}
        {' '}y se guarda diciendo cuál se usó.
      </p>
      {!abierto && (
        <p className="fine">
          {conDato.map((g) => g.rotulo).join(' · ')} — plegadas para que se vean las gráficas.
        </p>
      )}
      {abierto && conDato.map((g) => (
        <div key={g.rotulo} className="tabla-scroll">
          <table className="tabla">
            <thead>
              <tr>
                <th>{g.rotulo} ({g.unidad})</th>
                {g.presentes.map(([f]) => <th key={f} className="num">{f}</th>)}
              </tr>
            </thead>
            <tbody>
              {primeras.map((x, i) => (
                <tr key={i}>
                  <td>{x.hora == null ? '—' : `${String(x.hora).padStart(2, '0')}:00`}</td>
                  {g.presentes.map(([f, c]) => (
                    <td key={f} className="num">
                      {x[c] == null ? '—' : nf(x[c] as number, g.dec)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {abierto && registros.length > primeras.length && (
        <p className="fine">Se muestran {primeras.length} de {nf(registros.length)} horas.</p>
      )}
    </div>
  );
}

/**
 * LAS GRÁFICAS DE CADA MAGNITUD, CON SUS FASES (`99 §ADR-107`).
 *
 * Las gráficas de este módulo estaban TODAS cableadas al porcentaje de carga:
 * una carga de tensiones se guardaba entera y la pantalla seguía enseñando sus
 * tarjetas vacías, «esperando la corriente». El Ingeniero lo dijo mirándolo:
 * «no veo las gráficas de las tensiones».
 *
 * ⚠️ EL EJE NO EMPIEZA EN CERO, Y SE DICE. Una línea de 66 kV se mueve entre
 * 68,1 y 69,8: dibujada desde cero es una raya plana que no informa de nada, y
 * dibujada sin decirlo convierte una variación del 2 % en un tobogán que asusta.
 * Se ajusta al dato, se rotulan los extremos reales y se avisa debajo. Es la
 * misma regla que ya gobierna las bandas de color: el dibujo no puede sugerir
 * una conclusión que el número no sostiene.
 */
function GraficasPorFase({ registros }: { registros: Registro[] }) {
  const GRUPOS = [
    { rotulo: 'Tensión entre fases', unidad: 'kV', dec: 1, agregado: 'tension_kV',
      cols: [['RS', 'tensionRS_kV'], ['ST', 'tensionST_kV'], ['TR', 'tensionTR_kV']] as const },
    { rotulo: 'Tensión fase-tierra', unidad: 'kV', dec: 1, agregado: 'tension_kV',
      cols: [['R', 'tensionR_kV'], ['S', 'tensionS_kV'], ['T', 'tensionT_kV']] as const },
    // ⚠️ MÁS ALTA QUE LAS DEMÁS, y no es estética (`99 §ADR-124`): es la única
    // que produce un DICTAMEN —corriente contra ampacidad—. Cinco gráficas del
    // mismo tamaño dicen que las cinco pesan igual, y no es verdad.
    { rotulo: 'Corriente', unidad: 'A', dec: 0, agregado: 'corriente_A', alto: 340,
      cols: [['R', 'corrienteR_A'], ['S', 'corrienteS_A'], ['T', 'corrienteT_A']] as const },
    { rotulo: 'Potencia activa', unidad: 'MW', dec: 2, agregado: 'potenciaActiva_MW',
      cols: [['R', 'potenciaActivaR_MW'], ['S', 'potenciaActivaS_MW'], ['T', 'potenciaActivaT_MW']] as const },
    { rotulo: 'Potencia reactiva', unidad: 'MVAr', dec: 2, agregado: 'potenciaReactiva_MVAr',
      cols: [['R', 'potenciaReactivaR_MVAr'], ['S', 'potenciaReactivaS_MVAr'], ['T', 'potenciaReactivaT_MVAr']] as const },
    { rotulo: 'Potencia aparente', unidad: 'MVA', dec: 2, agregado: 'potenciaAparente_MVA',
      cols: [['R', 'potenciaAparenteR_MVA'], ['S', 'potenciaAparenteS_MVA'], ['T', 'potenciaAparenteT_MVA']] as const },
  ];
  // Los tres tonos son FIJOS y con su rótulo al lado: un color sin leyenda es
  // una raya de adorno, y aquí hay que poder decir cuál fase se salió.
  //
  // ⚠️ LOS COLORES LOS FIJÓ EL INGENIERO (2026-09-07): primera fase AZUL,
  // segunda NARANJA, tercera VERDE — la misma convención de su análisis en
  // Python, para que una figura de aquí y una de allá se lean sin volver a
  // mirar la leyenda. Antes eran otros tres, y dos de ellos se parecían.
  //
  // Aviso dado y decisión suya: el naranja está cerca del color con el que este
  // sistema pinta «fuera de banda». Aquí no significa nada de eso — es la fase
  // B y punto — pero conviene saberlo al mirar dos pantallas seguidas.
  const TINTA = ['#1f77b4', '#ff7f0e', '#2ca02c'];

  /**
   * ⚠️ UNA GRÁFICA POR MAGNITUD PRESENTE, tenga fases o no (`99 §ADR-118`).
   *
   * Lo vio el Ingeniero: «no veo la potencia activa, la potencia reactiva». Y
   * era cierto — este componente solo dibujaba magnitudes CON FASES, y su
   * exportación trae la activa, la reactiva y la aparente **solo como
   * agregado**: no hay un archivo por fase de la potencia. Resultado: dos
   * gráficas de seis, y tres magnitudes guardadas que no se veían en ninguna
   * parte.
   *
   * Ahora, si la magnitud trae fases se dibujan sus fases; si solo trae el
   * agregado, se dibuja el agregado y se DICE que es el agregado —no vaya a
   * parecer una fase suelta.
   */
  // ⚠️ EL AGREGADO LO RECLAMA UN SOLO GRUPO. «Tensión entre fases» y «tensión
  // fase-tierra» comparten el mismo campo agregado, así que caer al total en los
  // dos pintaba la MISMA línea dos veces, y una de ellas con el rótulo
  // equivocado —«fase a tierra» sobre una medida entre fases, que es el factor
  // de 1,73 que este módulo lleva cuidando desde el principio—. Se queda el
  // primero que lo declara.
  /** De cuándo a cuándo va lo dibujado, dicho en palabras y no en un eje. */
  const primero = registros[0];
  const ultimo = registros[registros.length - 1];
  const cuantosDias = new Set(registros.map((x) => String(x.fecha))).size;
  const periodoDicho = !primero ? '' : cuantosDias === 1
    ? `${String(primero.fecha)} · el día entero`
    : `del ${String(primero.fecha)} al ${String(ultimo.fecha)} · ${cuantosDias} días`;
  /** Cada cuánto hay una lectura. Se mira el dato, no se supone. */
  const paso = new Set(registros.map((x) => Number(x.hora))).size >= 20 ? 'hora' : null;

  const reclamado = new Set<string>();
  const conDato = GRUPOS
    .map((g) => {
      const fases = g.cols.filter(([, c]) => registros.some((x) => x[c] != null));
      if (fases.length) { reclamado.add(g.agregado); return { ...g, presentes: fases, soloAgregado: false }; }
      const hay = registros.some((x) => x[g.agregado] != null) && !reclamado.has(g.agregado);
      if (hay) reclamado.add(g.agregado);
      return hay
        ? { ...g, presentes: [['total', g.agregado]] as unknown as typeof g.cols, soloAgregado: true }
        : { ...g, presentes: [] as unknown as typeof g.cols, soloAgregado: false };
    })
    .filter((g) => g.presentes.length > 0);
  if (!conDato.length) return null;

  return (
    <>
      {conDato.map((g) => {
        const valores = registros.flatMap((x) => g.presentes
          .map(([, c]) => x[c]).filter((v): v is number => typeof v === 'number'));
        const min = Math.min(...valores);
        const max = Math.max(...valores);
        // Un margen del 8 % del recorrido para que la línea no toque los bordes.
        // Si todo el día vale lo mismo, se abre a mano: un rango de cero alto
        // haría una división por cero y una gráfica sin sentido.
        const holgura = (max - min) || Math.max(Math.abs(max) * 0.02, 0.1);
        const lo = min - holgura * 0.08;
        const hi = max + holgura * 0.08;
        // Cada magnitud dibuja en SU lienzo: solo cambia el alto.
        const lz = { ...LIENZO, alto: (g as { alto?: number }).alto ?? LIENZO.alto };
        const yEn = (v: number) => lz.alto - lz.margen.b
          - ((v - lo) / (hi - lo)) * (lz.alto - lz.margen.s - lz.margen.b);
        const marcas = marcasDeRango(lo, hi);
        const { idx, modo } = marcasDeTiempo(registros as never[]);
        // La mayor distancia entre la fase más alta y la más baja en un mismo
        // instante: es lo que explica por qué tres líneas parecen una.
        const separacion = g.presentes.length < 2 ? null : registros.reduce((peor, x_) => {
          const v = g.presentes.map(([, c]) => x_[c]).filter((z): z is number => typeof z === 'number');
          return v.length < 2 ? peor : Math.max(peor, Math.max(...v) - Math.min(...v));
        }, 0);

        return (
          <div className="tarjeta" key={g.rotulo}>
            <p className="mapa-capas-t">{g.rotulo} ({g.unidad})</p>
            {/* ⚠️ QUÉ FRANJA Y CON QUÉ PASO (`99 §ADR-122`). El eje rotulaba
                «13/01 00h … 20/01 23h» y había que deducir de ahí si eran horas,
                días o meses. Se dice: de cuándo a cuándo, cuántas lecturas y cada
                cuánto. Una gráfica sin su periodo no se puede citar en un informe. */}
            <p className="fine">
              {periodoDicho} · <b>{nf(registros.length)}</b> lectura(s)
              {paso ? <> · una cada <b>{paso}</b></> : null}
            </p>
            <div className="bandas-reparto">
              {g.presentes.map(([fase], k) => (
                <span key={fase} className="banda-chip">
                  <i style={{ background: TINTA[k % TINTA.length] }} />{' '}
                  {g.soloAgregado ? 'total de la bahía' : `fase ${fase}`}
                </span>
              ))}
            </div>
            <svg viewBox={`0 0 ${lz.ancho} ${lz.alto}`} className="grafica" role="img"
              aria-label={`${g.rotulo} por fase, ${registros.length} instantes`}>
              {marcas.map(({ v, cero }, k) => (
                <g key={k}>
                  {/* ⚠️ La del CERO se pinta distinta: en una magnitud con signo es
                      donde se invierte el sentido del flujo, no una cifra más. */}
                  <line x1={lz.margen.i} x2={lz.ancho - lz.margen.d}
                    y1={yEn(v)} y2={yEn(v)} stroke={cero ? 'var(--tx-tenue, #888)' : 'var(--bd-tenue)'}
                    strokeWidth={cero ? 1.4 : 1} strokeDasharray={cero ? '4 3' : undefined} />
                  <text x={lz.margen.i - 6} y={yEn(v) + 4} textAnchor="end"
                    fontSize={10} fill="var(--tx-tenue, #888)"
                    fontWeight={cero ? 700 : undefined}>{nf(v, g.dec)}</text>
                </g>
              ))}
              {/* ⚠️ LA UNIDAD, ROTULANDO EL EJE (`99 §ADR-122`). Pegada al número
                  —«-27,54 MW»— la etiqueta se salía del margen izquierdo y
                  aparecía cortada: se veía «',54 MW». Va arriba del eje, que es
                  su sitio, y ahí cabe siempre sea cual sea la cifra. */}
              <text x={lz.margen.i} y={lz.margen.s - 6} textAnchor="start"
                fontSize={10} fill="var(--tx-tenue, #888)">{g.unidad}</text>
              {g.presentes.map(([fase, campo], k) => {
                const trazo = registros
                  .map((x_, i) => (typeof x_[campo] === 'number'
                    ? `${x(i, registros.length, lz)},${yEn(x_[campo] as number)}` : null))
                  .filter((v): v is string => v !== null)
                  .join(' ');
                return (
                  <g key={fase}>
                    <polyline points={trazo} fill="none" stroke={TINTA[k % TINTA.length]}
                      strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
                    {/* ⚠️ Los puntos solo cuando se distinguen (`99 §ADR-120`). Un
                        mes son ~700 instantes por fase: dibujar un círculo por
                        cada uno tapa la línea y cuesta miles de nodos. La línea
                        sigue siendo el dato; el punto era la ayuda para leerlo. */}
                    {registros.length <= PUNTOS_VISIBLES && registros.map((x_, i) => (typeof x_[campo] === 'number' ? (
                      <circle key={i} cx={x(i, registros.length, lz)} cy={yEn(x_[campo] as number)} r={2.2}
                        fill={TINTA[k % TINTA.length]}>
                        <title>
                          {etiquetaInstante(x_ as never)} · {fase} · {nf(x_[campo] as number, g.dec)} {g.unidad}
                        </title>
                      </circle>
                    ) : null))}
                  </g>
                );
              })}
              {/* ⚠️ MARCAS DONDE EMPIEZA CADA DÍA (`99 §ADR-123`). Repartidas cada N
                  puntos caían a media jornada y cada etiqueta llevaba fecha Y
                  hora apretadas —«13/01 00h»—. Ahora el eje rotula DÍAS cuando
                  hay varios y HORAS cuando es uno solo, y la marca cae en la
                  frontera, que es lo que el ojo busca en una serie horaria.
                  La última se ancla al final o se sale del lienzo. */}
              {idx.map((i, k) => (
                <text key={i} x={x(i, registros.length, lz)} y={lz.alto - 10}
                  textAnchor={k === idx.length - 1 ? 'end' : k === 0 ? 'start' : 'middle'}
                  fontSize={9} fill="var(--tx-tenue, #888)">
                  {marcaDeTiempo(registros[i] as never, modo)}
                </text>
              ))}
              {/* ⚠️ LA FECHA, DENTRO DE LA FIGURA. Va en la cabecera de la tarjeta,
                  pero una captura de la gráfica sola —que es lo que acaba en un
                  informe— se quedaba sin ella. Aquí, discreta y a la derecha. */}
              <text x={lz.ancho - lz.margen.d} y={lz.margen.s - 6} textAnchor="end"
                fontSize={9} fill="var(--tx-tenue, #888)">{periodoDicho}</text>
            </svg>
            <p className="fine">
              {g.presentes.map(([fase], k) => (
                <span key={fase} style={{ color: TINTA[k % TINTA.length] }}>
                  <b>{fase}</b>{k < g.presentes.length - 1 ? ' · ' : ''}
                </span>
              ))}
              {' — '}entre <b>{nf(min, g.dec)}</b> y <b>{nf(max, g.dec)} {g.unidad}</b>.
              {separacion != null && (
                separacion < (max - min) * 0.06
                  ? <> ⚠️ <b>Las {g.presentes.length} líneas se superponen</b> porque las fases van
                    casi iguales: la mayor separación entre ellas en todo el periodo es de{' '}
                    <b>{nf(separacion, g.dec)} {g.unidad}</b>. No es un fallo del dibujo — es que la
                    carga está bien repartida.</>
                  : <> Mayor separación entre fases: <b>{nf(separacion, g.dec)} {g.unidad}</b>.</>
              )}
              {g.soloAgregado && (
                <> Su archivo no trae esta magnitud <b>por fases</b>: lo que se dibuja es el
                total de la bahía, no una fase suelta.</>
              )}
              {' '}⚠️ <b>El eje no empieza en cero</b>: se ajusta al recorrido del dato. Desde cero,
              esta variación sería una raya plana; sin decirlo, parecería un tobogán.
            </p>
          </div>
        );
      })}
    </>
  );
}

function VistaPrevia({ registros }: { registros: Registro[] }) {
  const primeras = registros.slice(0, 8);
  if (!primeras.length) return null;
  return (
    <div className="tarjeta">
      <p className="mapa-capas-t">Vista previa</p>
      <div className="tabla-scroll">
        <table className="tabla">
          <thead>
            <tr><th>Fecha</th><th>Hora</th><th>Línea</th><th>Circuito</th>
              <th>Cargabilidad</th><th>Corriente</th><th>Estado</th></tr>
          </thead>
          <tbody>
            {primeras.map((x_, i) => (
              <tr key={i}>
                <td>{x_.fecha}</td>
                <td>{x_.hora == null ? '—' : `${String(x_.hora).padStart(2, '0')}:00`}</td>
                <td>{x_.linea}</td>
                <td>{x_.circuito ?? '—'}</td>
                <td style={{ color: tintaDe(x_.cargabilidad_pct as number | null) }}>
                  {x_.cargabilidad_pct == null ? 'sin medida' : `${nf(x_.cargabilidad_pct as number, 1)} %`}
                  {x_.naturaleza === 'derivada' && <span className="fine"> (derivada)</span>}
                </td>
                <td>{x_.corriente_A == null ? '—' : `${nf(x_.corriente_A as number, 0)} A`}</td>
                <td>{x_.estado ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {registros.length > primeras.length && (
        <p className="fine">Se muestran {primeras.length} de {nf(registros.length)}. El resto, en la tabla del final.</p>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// EL VEREDICTO ELÉCTRICO — la única cifra de este módulo que DICTAMINA
// ────────────────────────────────────────────────────────────────────────────
// ⚠️ AQUÍ HAY DOS PORCENTAJES Y NO SON EL MISMO. Es todo el enredo de este
// módulo, así que la pantalla los separa a la fuerza:
//
//   · **% del archivo** — corriente ÷ capacidad NOMINAL (la de placa, fija).
//     Lo trae el SCADA. No es un veredicto: es lo que el archivo declaró.
//   · **% contra ampacidad** — corriente ÷ capacidad del conductor. **Éste es el
//     veredicto.** Desde `99 §ADR-098` ese denominador es, por orden del
//     Ingeniero, **el que declara la ficha del FABRICANTE** cuando la línea la
//     tiene; y solo si no la tiene, el que calculamos por IEEE 738.
//
// Los mismos amperios pueden salir al 71 % con uno y al 98 % con el otro. Poner
// uno de los dos «grande» y el otro de nota al pie sería elegir por el
// Ingeniero. Van del mismo tamaño, uno al lado del otro, con su denominador
// escrito debajo (`99 §ADR-093`).
//
// ⚠️ Y el veredicto sale del PICO, no del promedio: lo que decide si una línea
// aguanta es el momento en que más cargó.
// ════════════════════════════════════════════════════════════════════════════

function ElVeredicto({ v, referencia }: {
  v: { pico: Registro; contraste: ReturnType<typeof contrasteConLaAmpacidad> };
  referencia: ReturnType<typeof ampacidadDeLinea>;
}) {
  const c = v.contraste as Record<string, unknown>;
  if (!c.comparable) {
    return (
      <div className="tarjeta">
        <p className="mapa-capas-t">Veredicto eléctrico</p>
        <p className="advertencia"><b>No se puede dictaminar:</b> {String(c.porQue)}</p>
      </div>
    );
  }
  const contra = c.contraAmpacidad_pct as number;
  const declarado = c.declarado_pct as number | null;

  return (
    <div className="tarjeta">
      <p className="mapa-capas-t">Veredicto eléctrico — el pico del periodo</p>
      <div className="kpis">
        <Kpi v={`${nf(contra, 1)} %`} r="contra la AMPACIDAD"
          s={`${nf(c.corriente_A as number)} A ÷ ${nf(c.ampacidad_A as number)} A`}
          color={tintaDe(contra)} />
        <Kpi v={declarado == null ? '—' : `${nf(declarado, 1)} %`} r="% del ARCHIVO"
          s="contra la capacidad nominal de placa" />
        <Kpi v={`${nf(c.corriente_A as number)} A`} r="corriente del pico"
          s={`${String(v.pico.linea)} · ${String(v.pico.fecha)}`
            + (v.pico.hora != null ? ` · ${String(v.pico.hora).padStart(2, '0')}:00` : '')} />
        {/* ⚠️ Desde `99 §ADR-098` este número puede NO ser nuestro, y además
            puede no ser el de registro: el veredicto divide entre la VIGENTE. */}
        <Kpi v={`${nf(c.ampacidad_A as number)} A`} r="ampacidad VIGENTE"
          s={referencia.vigenteRotulo} />
      </div>

      {/* ⚠️ La frase que impide leer las dos cifras como si compitieran. */}
      <p className="fine">
        <b>Las dos son ciertas y responden a preguntas distintas.</b> El «% del archivo» se calculó
        contra la capacidad <b>nominal</b> de placa, que es fija. El «contra la ampacidad» usa la
        capacidad <b>real</b> del conductor con las condiciones de abajo, que es la que decide si la
        línea aguanta{c.diferencia_pct != null && Math.abs(c.diferencia_pct as number) >= 1
          ? <> — hay <b>{nf(Math.abs(c.diferencia_pct as number), 1)} puntos</b> de diferencia
            entre las dos</>
          : null}.
      </p>

      {c.aviso ? <p className="advertencia alerta">⚠️ {String(c.aviso)}</p> : null}

      {/* ⚠️ ORDEN DEL INGENIERO (2026-09-05): la temperatura de operación tiene
          que venir del FABRICANTE. Mientras no venga, este amperaje se sigue
          enseñando —no se pierde visibilidad— pero NO se presenta como
          dictamen, y se dice antes del número, no en la letra pequeña. */}
      {referencia.esDictamen === false && (
        <p className="advertencia alerta">
          ⚠️ <b>Este amperaje NO es un dictamen.</b> La temperatura de operación del conductor no la
          ha declarado ningún fabricante: {referencia.temperatura.rotulo}. Siete fichas públicas dan
          <b> 75 °C</b> para este conductor y aquí se están usando <b>90 °C</b> — son <b>17 % de
          capacidad de más</b>, por el lado que hace que una línea sobrecargada parezca sana.
        </p>
      )}

      <p className="mapa-capas-n">
        <b>Ampacidad:</b> {referencia.rotulo}
      </p>

      {/* ══════════════════════════════════════════════════════════════════════
          DE QUIÉN ES EL DENOMINADOR — `99 §ADR-098`
          ────────────────────────────────────────────────────────────────────
          Orden del Ingeniero (2026-09-05): la ampacidad es la que dice el
          fabricante. Eso da trazabilidad y NO da física: la ficha se calculó con
          SUS condiciones y la línea opera con las del sitio. El sistema no
          cambia su cifra — enseña las dos y deja la decisión donde va.
          ══════════════════════════════════════════════════════════════════════ */}
      {referencia.naturaleza === 'declarada' && referencia.fabricante && (
        <div className="tabla-scroll">
          <table>
            <tbody>
              <tr><td>Fabricante</td><td><b>{referencia.fabricante.fabricante}</b></td></tr>
              <tr><td>Documento</td><td>{referencia.fabricante.documento}
                {referencia.fabricante.ubicacionEnDocumento
                  ? ` · ${referencia.fabricante.ubicacionEnDocumento}` : ''}</td></tr>
              <tr><td>Conductor a</td><td>{referencia.fabricante.tempConductor_C} °C</td></tr>
              <tr><td>Método de la ficha</td><td>{referencia.fabricante.metodo}</td></tr>
              {referencia.contraste?.comparable && (
                <tr>
                  <td>Con las condiciones del sitio</td>
                  <td><b>{nf(referencia.contraste.enElSitio_A)} A</b>{' '}
                    ({referencia.contraste.delta_A > 0 ? '+' : ''}
                    {nf(referencia.contraste.delta_pct, 1)} % respecto a la ficha)</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {referencia.naturaleza === 'derivada' && (
        <p className="fine">
          Esta cifra la <b>calculó el sistema</b>: la línea no declara todavía la ampacidad de su
          ficha de fabricante. Declararla la convierte en el número de registro y deja este
          cálculo como contraste.
        </p>
      )}
      {referencia.avisos.map((a, i) => (
        <p key={i} className="advertencia">{a}</p>
      ))}

      {/* Lo que hace visible que la condición ES el veredicto. */}
      {referencia.sensibilidadViento.length > 0 && (
        <p className="fine">
          Con este mismo conductor, solo cambiando el viento:{' '}
          {referencia.sensibilidadViento.map((x) =>
            `${x.viento_m_s === 0 ? 'calma' : `${x.viento_m_s} m/s`} → ${nf(x.ampacidad_A)} A`)
            .join(' · ')}. Por eso la condición se declara, y no se supone.
        </p>
      )}
      <Sello />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// LO QUE SALDRÁ — la pantalla vacía enseña su ESTRUCTURA, no datos
// ────────────────────────────────────────────────────────────────────────────
// ⚠️ POR QUÉ EXISTE ESTE BLOQUE, y es un fallo mío corregido. El Ingeniero pidió
// tres veces ver «las gráficas y las variables» y las tres veces se encontró una
// pantalla que solo decía «cargue su archivo». Todo lo construido vive detrás de
// esa frase, así que le pedí que confiara a ciegas en algo que no podía ver.
//
// ⚠️ Y NO se resuelve inventando cifras de muestra: eso está prohibido por orden
// suya del 2026-08-29, y con razón —de una muestra a que alguien la tome por
// medida hay un paso—. Lo que sí se puede enseñar es **la estructura**: qué hay,
// qué contesta cada uno y qué columna del archivo lo enciende. Ni una cifra
// inventada; el único número que aparece es la ampacidad, que **no sale del
// archivo sino del conductor declarado** y ya está calculada (`99 §ADR-096`).
// ════════════════════════════════════════════════════════════════════════════

const LO_QUE_SALDRA = [
  { q: 'Veredicto eléctrico', a: '¿va cargada esta línea, de verdad?',
    con: 'la corriente de cada hora' },
  { q: 'Qué transporta', a: '¿cuántos amperios NO están haciendo trabajo?',
    con: 'potencia activa y reactiva · tensión' },
  { q: 'Las tres fases', a: '¿es carga, o hay una fase degradándose?',
    con: 'la corriente de las tres fases' },
  { q: 'Lo que cuesta', a: '¿cuántos kW se quedan en el conductor?',
    con: 'la corriente (y ya tenemos conductor y longitud)' },
  { q: 'En el tiempo', a: '¿fue un pinchazo o una tarde entera?',
    con: 'al menos seis horas con corriente' },
  { q: 'Qué NO trae su archivo', a: '¿qué le pido a quien exporta del SCADA?',
    con: 'se llena solo, mirando lo que llegó' },
];

function LoQueSaldra({ referencia }: { referencia: ReturnType<typeof ampacidadDeLinea> }) {
  return (
    <div className="tarjeta">
      <p className="mapa-capas-t">Lo que saldrá en cuanto cargue el archivo</p>
      <p className="fine">
        Esto es la <b>estructura</b>, no una demostración: no hay ni una cifra de ejemplo. Cada
        bloque dice qué pregunta contesta y qué columna de su exportación lo enciende.
      </p>
      <div className="tabla-scroll">
        <table className="tabla">
          <thead><tr><th>Bloque</th><th>Qué contesta</th><th>Se enciende con</th></tr></thead>
          <tbody>
            {LO_QUE_SALDRA.map((x) => (
              <tr key={x.q}><td><b>{x.q}</b></td><td>{x.a}</td><td className="fine">{x.con}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ⚠️ EL ÚNICO NÚMERO DE ESTA TARJETA, y no sale del archivo: sale del
          conductor que la línea ya declara. Contra él se dividirá la corriente
          el día que llegue. Enseñarlo ahora no es un ejemplo — es el
          denominador, que ya existe. */}
      {referencia.ampacidad_A != null ? (
        <p className="mapa-capas-n">
          <b>El denominador ya está listo: {nf(referencia.ampacidad_A)} A.</b>{' '}
          {referencia.naturaleza === 'declarada'
            ? <>Es la cifra que <b>declara {referencia.fabricante?.fabricante}</b> en su ficha
              técnica, no un cálculo nuestro.</>
            : <>La <b>calculó el sistema</b> a partir del conductor de esta línea — la línea
              todavía no declara la ampacidad de su ficha de fabricante.</>}{' '}
          En cualquier caso no sale de su archivo. Cuando cargue la corriente, el veredicto es esa
          división.
          <br /><span className="fine">{referencia.rotulo}</span>
          {referencia.esDictamen === false && (
            <><br /><b>⚠️ Y todavía no es un dictamen:</b> la temperatura de operación del conductor
            no la ha declarado ningún fabricante.</>
          )}
        </p>
      ) : (
        <p className="advertencia">
          <b>Falta el denominador:</b> {referencia.motivo}. Sin ampacidad habrá porcentajes del
          archivo, pero no veredicto.
        </p>
      )}
      {referencia.avisos.map((a, i) => <p key={i} className="fine">{a}</p>)}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// EL ENTORNO COMPLETO, VACÍO — el instrumento antes de que llegue la medida
// ────────────────────────────────────────────────────────────────────────────
// ⚠️ Orden del Ingeniero (2026-09-04): «dame todo el entorno y los valores en 0
// hasta que yo vaya cargando los archivos, pero necesito ver las gráficas, los
// parámetros y las variables».
//
// ⚠️ Y LA REGLA QUE LO HACE COMPATIBLE con su orden del 2026-08-29. Se enseña
// TODO el instrumento —los ejes, las bandas 80/90/100, la ampacidad del
// conductor, cada parámetro con su nombre y su unidad— porque nada de eso es una
// medida inventada: la escala existe, las bandas existen y la ampacidad sale del
// conductor declarado. Lo que NO se escribe es «0 A» donde no hay lectura.
//
// **Un hueco no es un cero.** Cero amperios significa «línea sin carga»; ningún
// dato significa «nadie ha medido». Confundirlos es el error que este módulo
// entero existe para impedir. Así que: los CONTADORES van a 0 —porque cero
// registros cargados es verdad— y las MEDIDAS van a «—» con su motivo.
// ════════════════════════════════════════════════════════════════════════════

/** La rejilla y las referencias de una gráfica de cargabilidad, sin serie. */
function LienzoVacio({ techo, etiqueta }: { techo: number; etiqueta: string }) {
  return (
    <svg viewBox={`0 0 ${LIENZO.ancho} ${LIENZO.alto}`} className="grafica" role="img"
      aria-label={`${etiqueta} — sin datos cargados`}>
      {marcasY(techo).map((v) => (
        <g key={v}>
          <line x1={LIENZO.margen.i} x2={LIENZO.ancho - LIENZO.margen.d}
            y1={y(v, techo)} y2={y(v, techo)} stroke="var(--bd-tenue)" strokeWidth={1} />
          <text x={LIENZO.margen.i - 6} y={y(v, techo) + 4} textAnchor="end"
            fontSize={10} fill="var(--tx3)">{v}</text>
        </g>
      ))}
      {/* Las tres bandas de lectura SÍ existen sin dato: son la escala. */}
      {REFERENCIAS.filter((v) => v <= techo).map((v) => (
        <g key={`r${v}`}>
          <line x1={LIENZO.margen.i} x2={LIENZO.ancho - LIENZO.margen.d}
            y1={y(v, techo)} y2={y(v, techo)} strokeDasharray="5 3" strokeWidth={1.4}
            stroke={TINTA_BANDA[bandaDe(v)!.clave]} />
          <text x={LIENZO.ancho - LIENZO.margen.d} y={y(v, techo) - 4} textAnchor="end"
            fontSize={10} fill={TINTA_BANDA[bandaDe(v)!.clave]}>{v} %</text>
        </g>
      ))}
      <text x={LIENZO.ancho / 2} y={LIENZO.alto / 2} textAnchor="middle"
        fontSize={13} fill="var(--tx3)">Sin lecturas — el eje y las bandas ya están</text>
      <text x={LIENZO.margen.i} y={LIENZO.alto - 8} fontSize={10} fill="var(--tx3)">
        cada punto será una hora de su archivo
      </text>
    </svg>
  );
}

function ElEntorno({ referencia, disponible, enElTiempo }: {
  referencia: ReturnType<typeof ampacidadDeLinea>;
  disponible: ReturnType<typeof disponibilidadDeVariables>;
  enElTiempo: ReturnType<typeof comportamientoEnElTiempo>;
}) {
  const amp = referencia.ampacidad_A;
  const sinLectura = 'ninguna lectura cargada todavía';

  return (
    <>
      {/* ── El veredicto, con su denominador ya puesto ─────────────────── */}
      <div className="tarjeta">
        <p className="mapa-capas-t">Veredicto eléctrico — esperando la corriente</p>
        <div className="kpis">
          <Dato v={null} r="Cargabilidad" falta="falta la corriente: es lo único que no tenemos" />
          <Dato v={null} r="Corriente del pico" falta={sinLectura} />
          <Dato v={amp == null ? null : `${nf(amp)} A`} r="Ampacidad"
            s="del conductor, no del archivo" color="var(--acc)" falta={referencia.motivo} />
          <Dato v={null} r="Margen disponible" falta="saldrá de restar la corriente a la ampacidad" />
        </div>
        <p className="fine">
          El denominador ya está; falta el numerador. <b>No se escribe «0 %»</b>: cero por ciento
          significaría línea descargada, y lo que pasa es que nadie ha medido todavía.
        </p>
      </div>

      {/* ── Qué transporta: todos los parámetros con su nombre y unidad ── */}
      <div className="tarjeta">
        <p className="mapa-capas-t">Qué transporta — los parámetros que se leerán</p>
        <div className="kpis">
          <Dato v={null} r="Potencia aparente" s="MVA · √3·V·I" falta={sinLectura} />
          <Dato v={null} r="Potencia activa" s="MW" falta="columna de MW" />
          <Dato v={null} r="Potencia reactiva" s="MVAr" falta="columna de MVAr" />
          <Dato v={null} r="Factor de potencia" s="cos φ = P ÷ S" falta="hace falta la activa" />
          <Dato v={null} r="Corriente en reactiva" s="A que no hacen trabajo" falta="hace falta la reactiva" />
          <Dato v={null} r="Tensión de operación" s="kV" falta="columna de tensión" />
          <Dato v={null} r="Desbalance entre fases" s="%" falta="las tres corrientes de fase" />
          <Dato v={null} r="Corriente residual" s="A" falta="exige los ángulos, no solo las magnitudes" />
        </div>
      </div>

      {/* ── Lo que cuesta ──────────────────────────────────────────────── */}
      <div className="tarjeta">
        <p className="mapa-capas-t">Lo que cuesta transportarlo</p>
        <div className="kpis">
          <Dato v={null} r="Pérdidas en el conductor" s="kW · 3·I²·R" falta={sinLectura} />
          <Dato v={null} r="Resistencia" s="Ω/km a la temperatura del cálculo" falta="se fija al calcular" />
        </div>
      </div>

      {/* ── En el tiempo: aquí los CONTADORES sí van a cero, y es verdad ── */}
      <div className="tarjeta">
        <p className="mapa-capas-t">Cómo se comportó en el tiempo</p>
        <div className="kpis">
          <Dato v={`${nf(enElTiempo.n)}`} r="Lecturas con corriente" s="cargadas hasta ahora" />
          <Dato v={`${nf(enElTiempo.horasPorBanda.sobrecarga)}`} r="Horas sobre 100 %"
            s="no hay ninguna porque no hay ninguna hora" />
          <Dato v={null} r="Factor de carga" s="promedio ÷ pico" falta={enElTiempo.porQue} />
          <Dato v={null} r="Rampa máxima" s="A/h" falta="hacen falta horas consecutivas" />
        </div>
        <p className="fine">
          Estos contadores sí van a <b>cero</b>, y es cierto: cero lecturas cargadas. Las
          <b> medidas</b> de al lado van a «—» porque no existen, que no es lo mismo.
        </p>
      </div>

      {/* ── LAS GRÁFICAS, con su escala y sus bandas ────────────────────── */}
      <div className="tarjeta">
        <p className="mapa-capas-t">Cómo se comportará en el día</p>
        <div className="tabla-scroll"><LienzoVacio techo={100} etiqueta="Cargabilidad hora a hora" /></div>
        <div className="bandas-reparto">
          {BANDAS.map((b) => (
            <span key={b.clave} className="banda-chip">
              <i style={{ background: RELLENO_BANDA[b.clave] }} /> {b.rotulo}: <b>0</b> h
            </span>
          ))}
        </div>
        <p className="fine">
          La escala y las tres bandas de lectura (80 · 90 · 100 %) <b>ya son ciertas sin dato</b>:
          son la convención de operación, no una medida. Lo único que falta es la línea.
        </p>
      </div>

      <div className="tarjeta">
        <p className="mapa-capas-t">Mapa de calor — hora contra día</p>
        <div className="tabla-scroll">
          <table className="calor">
            <thead><tr><th /> {Array.from({ length: 24 }, (_, h) => (
              <th key={h}>{String(h).padStart(2, '0')}</th>))}</tr></thead>
            <tbody><tr><th scope="row">—</th>{Array.from({ length: 24 }, (_, h) => (
              <td key={h} className="sin-dato" title={`${String(h).padStart(2, '0')}h · sin medir`} />
            ))}</tr></tbody>
          </table>
        </div>
        <p className="fine">
          Una fila por línea y una celda por hora. <b>La celda en blanco es «no se midió»</b> — y
          seguirá en blanco para las horas que su archivo no traiga, también después de cargarlo.
        </p>
      </div>

      {/* ── Qué le falta a la exportación ──────────────────────────────── */}
      <div className="tarjeta">
        <p className="mapa-capas-t">Las variables que este módulo sabe leer</p>
        <div className="tabla-scroll">
          <table className="tabla">
            <thead><tr><th>Variable</th><th>Unidad</th><th>Desbloquea</th><th>Estado</th></tr></thead>
            <tbody>
              {disponible.map((v) => (
                <tr key={v.variable}>
                  <td><b>{v.rotulo}</b></td>
                  <td className="fine">{v.unidad}</td>
                  <td className="fine">{v.desbloquea}</td>
                  <td className="fine">sin archivo</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fine">
          En cuanto cargue, esta columna dirá para CADA variable si vino, si vino vacía, o si hay
          una cabecera que no supimos leer — que en ese caso <b>es fallo nuestro</b>.
        </p>
      </div>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// LAS VARIABLES OPERATIVAS
// ────────────────────────────────────────────────────────────────────────────
// ⚠️ LA REGLA DE ESTOS CUATRO BLOQUES — orden del Ingeniero, 2026-09-01:
// «no suponer nada, no colocar información basura». De ahí dos disciplinas:
//
//   · **Ninguna tarjeta enseña «—» mudo.** Si no hay dato, dice POR QUÉ no lo
//     hay. Un hueco sin motivo deja al lector sin saber si falta el dato o
//     falló el cálculo, y eso también es basura.
//   · **Nada está cableado.** Lo que se enseña sale de lo que la carga trae de
//     verdad (`disponibilidadDeVariables`), no de lo que yo creí que traía.
// ════════════════════════════════════════════════════════════════════════════

/** Un indicador que, cuando no tiene dato, dice por qué. */
function Dato({ v, r, s, color, falta }: {
  v: string | null; r: string; s?: string | null; color?: string; falta?: string | null;
}) {
  return (
    <div className="kpi">
      <div className="kpi-v" style={v == null ? { color: 'var(--tx3)' } : color ? { color } : undefined}>
        {v ?? '—'}
      </div>
      <div className="kpi-r">{r}</div>
      {/* El motivo ocupa el sitio del subtítulo: nunca se queda sin decir. */}
      {v == null ? <div className="kpi-s">{falta ?? 'sin dato en esta carga'}</div>
        : s ? <div className="kpi-s">{s}</div> : null}
    </div>
  );
}

function QueTransporta({ o, pico }: {
  o: { potencias: ReturnType<typeof potenciasDelInstante>;
       tension: ReturnType<typeof desviacionDeTension> };
  pico: Registro;
}) {
  const p = o.potencias;
  const fases = desbalanceDeFases({
    R: pico.corrienteR_A as number, S: pico.corrienteS_A as number, T: pico.corrienteT_A as number,
  });

  return (
    <div className="tarjeta">
      <p className="mapa-capas-t">Qué transporta la línea en ese pico</p>
      <div className="kpis">
        <Dato v={p.aparente_MVA == null ? null : `${nf(p.aparente_MVA, 1)} MVA`} r="Potencia aparente"
          s={p.tensionUsada.de === 'nominal'
            ? `√3 · ${nf(p.tensionUsada.kV!, 0)} kV NOMINALES · ${nf(pico.corriente_A as number)} A`
            : `√3 · ${nf(p.tensionUsada.kV!, 1)} kV medidos · ${nf(pico.corriente_A as number)} A`}
          falta={p.motivo} />
        <Dato v={p.activa_MW == null ? null : `${nf(p.activa_MW, 1)} MW`} r="Potencia activa"
          falta="esta carga no trae la columna de MW" />
        <Dato v={p.reactiva_MVAr == null ? null : `${nf(p.reactiva_MVAr, 1)} MVAr`} r="Potencia reactiva"
          s={p.naturaleza ?? undefined} falta="esta carga no trae la columna de MVAr" />
        <Dato v={p.factorDePotencia == null ? null : nf(p.factorDePotencia, 3)} r="Factor de potencia"
          falta="hace falta la potencia activa para calcularlo" />
        <Dato v={p.corrienteReactiva_A == null ? null : `${nf(p.corrienteReactiva_A)} A`}
          r="Corriente en reactiva"
          s={p.corrienteReactiva_pct != null ? `${nf(p.corrienteReactiva_pct, 1)} % de la corriente` : undefined}
          color="var(--tx-aviso)" falta="hace falta la reactiva y una tensión" />
        <Dato v={p.tensionUsada.de === 'medida' ? `${nf(p.tensionUsada.kV!, 1)} kV` : null}
          r="Tensión de operación"
          s={o.tension.desviacion_pct != null
            ? `${o.tension.desviacion_pct > 0 ? '+' : ''}${nf(o.tension.desviacion_pct, 1)} % de la nominal`
            : undefined}
          falta={o.tension.motivo} />
        <Dato v={fases.desbalance_pct == null ? null : `${nf(fases.desbalance_pct, 1)} %`}
          r="Desbalance entre fases"
          s={fases.faseMaxima ? `peor fase: ${fases.faseMaxima}` : undefined}
          falta={fases.motivo} />
      </div>

      {/* ⚠️ EL HALLAZGO. Sin este párrafo, la corriente reactiva es un número
          más; con él, es la única palanca que devuelve capacidad sin obra. */}
      {p.corrienteReactiva_A != null ? (
        <p className="mapa-capas-n">
          <b>{nf(p.corrienteReactiva_A)} A de los {nf(pico.corriente_A as number)} no transportan
          energía.</b> La reactiva no hace trabajo, pero ocupa conductor: consume amperios,
          calienta y le come margen a la línea. Compensarla es lo único que devuelve capacidad
          <b> sin tocar un solo conductor</b>.
        </p>
      ) : (
        <p className="fine">
          Con la potencia activa y la reactiva, aquí saldría cuántos de esos amperios no
          transportan energía — que suele ser la palanca más barata para recuperar capacidad.
        </p>
      )}
      <p className="fine">
        Y la tensión importa aunque no sea el límite que manda: <b>con la misma potencia, si la
        tensión baja la corriente sube</b>, y es la corriente la que calienta. Un hueco de tensión
        no relaja el veredicto térmico — lo empeora.
      </p>
    </div>
  );
}

function LoQueCuesta({ p }: { p: ReturnType<typeof perdidasJoule> }) {
  return (
    <div className="tarjeta">
      <p className="mapa-capas-t">Lo que cuesta transportarlo</p>
      {p.perdidas_kW == null ? (
        <p className="advertencia"><b>No se pueden calcular las pérdidas:</b> {p.motivo}</p>
      ) : (
        <>
          <div className="kpis">
            <Dato v={`${nf(p.perdidas_kW)} kW`} r="Pérdidas en el conductor"
              s={`a ${nf(p.temperatura_C!, 0)} °C · el peor caso`} color="var(--tx-aviso)" />
            <Dato v={`${nf(p.resistencia_ohm_km!, 3)} Ω/km`} r="Resistencia"
              s={`${nf(p.resistenciaTramo_ohm!, 3)} Ω en la línea`} />
            <Dato v={`${nf(p.longitud_m! / 1000, 2)} km`} r="Longitud" s="del levantamiento" />
          </div>
          <p className="fine">
            3 · I² · R, con la resistencia real del conductor a la temperatura con la que se calculó
            la ampacidad — así las dos cifras hablan del mismo estado térmico. <b>Las pérdidas van
            con el CUADRADO de la corriente</b>: si una parte de esos amperios es reactiva, esa
            parte también se está pagando aquí.
          </p>
        </>
      )}
    </div>
  );
}

function EnElTiempo({ c }: { c: ReturnType<typeof comportamientoEnElTiempo> }) {
  const horas = Object.values(c.horasPorBanda).reduce((a, b) => a + b, 0);
  if (!horas && !c.suficiente) return null;
  return (
    <div className="tarjeta">
      <p className="mapa-capas-t">Cómo se comportó en el tiempo</p>
      <div className="kpis">
        <Dato v={c.factorDeCarga == null ? null : nf(c.factorDeCarga, 2)} r="Factor de carga"
          s="promedio ÷ pico" falta={c.porQue} />
        <Dato v={`${nf(c.horasPorBanda.sobrecarga)}`} r="Horas sobre 100 %"
          color={c.horasPorBanda.sobrecarga > 0 ? 'var(--tx-alerta)' : 'var(--tx-ok)'}
          s={`de ${nf(horas)} con medida`} />
        <Dato v={`${nf(c.horasPorBanda.atencion + c.horasPorBanda.sobrecarga)}`}
          r="Horas sobre 90 %" s="condición de atención" />
        <Dato v={c.rampaMaxima_A_h == null ? null : `${nf(c.rampaMaxima_A_h)} A/h`}
          r="Rampa máxima" s="entre horas consecutivas"
          falta={c.porQue ?? 'no hay dos horas seguidas del mismo día'} />
      </div>
      <p className="fine">
        <b>Un pico de un minuto y uno de seis horas piden decisiones distintas.</b> El conductor
        tiene inercia térmica y responde a lo segundo: por eso las horas sobre umbral dicen más del
        riesgo real que el instante más alto.
      </p>
    </div>
  );
}

function QueTraeElArchivo({ filas }: { filas: ReturnType<typeof disponibilidadDeVariables> }) {
  const faltan = filas.filter((f) => !f.hay);
  if (!faltan.length) return null;
  return (
    <div className="tarjeta">
      <p className="mapa-capas-t">Qué NO trae esta carga, y qué desbloquearía</p>
      <div className="tabla-scroll">
        <table className="tabla">
          <thead><tr><th>Variable</th><th>Por qué no está</th><th>Desbloquearía</th></tr></thead>
          <tbody>
            {faltan.map((f) => (
              <tr key={f.variable}>
                <td><b>{f.rotulo}</b> <span className="fine">({f.unidad})</span></td>
                <td>{f.porQue}</td>
                <td>{f.desbloquea}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* ⚠️ La distinción que convierte esta tabla en algo accionable. */}
      <p className="fine">
        Esto sale de ESTA carga, no de una lista escrita a mano. «No trae la columna» se arregla
        pidiéndosela a quien exporta del SCADA; «la columna viene vacía» significa que el dato
        existe y no se está registrando; y si aparece una cabecera sin reconocer, <b>el fallo es
        nuestro</b> y se arregla añadiendo el sinónimo.
      </p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// EL TABLERO
// ════════════════════════════════════════════════════════════════════════════
function Tablero({ t }: { t: ReturnType<typeof resumen> }) {
  const cifra = (v: number | null | undefined, u = ' %') => (v == null ? '—' : `${nf(v, 1)}${u}`);
  return (
    <div className="tarjeta">
      <p className="mapa-capas-t">El periodo cargado, de un vistazo</p>
      <div className="kpis">
        <Kpi v={cifra(t.maxima?.pct)} r="Cargabilidad máxima"
          s={t.maxima ? `${t.maxima.linea} · ${t.maxima.fecha}` : undefined}
          color={tintaDe(t.maxima?.pct ?? null)} />
        <Kpi v={cifra(t.promedio)} r="Promedio del periodo" color={tintaDe(t.promedio)} />
        <Kpi v={cifra(t.minima?.pct)} r="Cargabilidad mínima"
          s={t.minima ? `${t.minima.linea} · ${t.minima.fecha}` : undefined} />
        <Kpi v={t.lineaMasCargada?.linea ?? '—'} r="Línea con mayor pico"
          s={t.lineaMasCargada?.maxima_pct != null ? `${nf(t.lineaMasCargada.maxima_pct, 1)} %` : undefined} />
        <Kpi v={t.horaPico ? `${String(t.horaPico.hora).padStart(2, '0')}:00` : '—'}
          r="Hora de mayor carga"
          s={t.horaPico?.promedio_pct != null ? `promedio ${nf(t.horaPico.promedio_pct, 1)} %`
            : 'sin hora en el archivo'} />
        <Kpi v={nf(t.lineas)} r="Líneas analizadas" />
        <Kpi v={nf(t.registros)} r="Registros procesados"
          s={`${nf(t.conMedida)} con medida`} />
        <Kpi v={nf(t.eventosSobrecarga)} r="Eventos de sobrecarga" s="≥ 100 %"
          color={t.eventosSobrecarga > 0 ? 'var(--tx-alerta)' : undefined} />
        <Kpi v={cifra(t.disponibilidad_pct)} r="Datos disponibles"
          s="qué parte de lo cargado trae medida" />
      </div>
      <div className="bandas-reparto">
        {BANDAS.map((b) => (
          <span key={b.clave} className="banda-chip">
            <i style={{ background: RELLENO_BANDA[b.clave] }} /> {b.rotulo}:{' '}
            <b>{nf(t.porBanda[b.clave] ?? 0)}</b>
          </span>
        ))}
      </div>
      {/* ⚠️ La frase que impide leer un color como un dictamen. */}
      <p className="fine">
        Las bandas 80/90/100 son de LECTURA, no un dictamen: son la convención de operación para leer
        el mapa de un vistazo, no una norma citada. El veredicto de una línea sale de comparar la
        corriente con la ampacidad del día (pestaña <b>Mecánico</b>, IEEE 738).
      </p>
    </div>
  );
}

function Kpi({ v, r, s, color }: { v: string; r: string; s?: string | null; color?: string }) {
  return (
    <div className="kpi">
      <div className="kpi-v" style={color ? { color } : undefined}>{v}</div>
      <div className="kpi-r">{r}</div>
      {s && <div className="kpi-s">{s}</div>}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TENDENCIA
// ════════════════════════════════════════════════════════════════════════════
function Tendencia({ registros }: { registros: Registro[] }) {
  const lineas = useMemo(
    () => [...new Set(registros.map((x_) => String(x_.linea)))].sort(), [registros]);
  const [cual, setCual] = useState<string>('');   // '' = todas juntas
  const serie = useMemo(
    () => serieTemporal(registros as never[], cual || null), [registros, cual]);
  const t = useMemo(() => tendencia(serie), [serie]);
  const techo = techoY(serie.map((p: { pct: number }) => p.pct));
  const tramos = tramosDeLinea(serie, techo);
  const idx = marcasX(serie.length);

  return (
    <div className="tarjeta">
      <p className="mapa-capas-t">Cómo se comportó en el tiempo</p>
      <label className="mapa-tiempo-dia">
        <span>Línea</span>
        <select value={cual} onChange={(e) => setCual(e.target.value)}>
          <option value="">Todas, una detrás de otra</option>
          {lineas.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </label>

      <svg viewBox={`0 0 ${LIENZO.ancho} ${LIENZO.alto}`} className="grafica" role="img"
        aria-label={`Cargabilidad en el tiempo${cual ? ` de ${cual}` : ''}`}>
        {marcasY(techo).map((v) => (
          <g key={v}>
            <line x1={LIENZO.margen.i} x2={LIENZO.ancho - LIENZO.margen.d}
              y1={y(v, techo)} y2={y(v, techo)} stroke="var(--bd-tenue)" strokeWidth={1} />
            <text x={LIENZO.margen.i - 6} y={y(v, techo) + 4} textAnchor="end"
              fontSize={10} fill="var(--tx-tenue, #888)">{v}</text>
          </g>
        ))}
        {/* Las tres referencias que él pidió. A rayas y con su número al lado:
            una línea de referencia sin rótulo es una raya más. */}
        {REFERENCIAS.filter((v) => v <= techo).map((v) => (
          <g key={`r${v}`}>
            <line x1={LIENZO.margen.i} x2={LIENZO.ancho - LIENZO.margen.d}
              y1={y(v, techo)} y2={y(v, techo)} strokeDasharray="5 3" strokeWidth={1.4}
              stroke={TINTA_BANDA[bandaDe(v)!.clave]} />
            <text x={LIENZO.ancho - LIENZO.margen.d} y={y(v, techo) - 4} textAnchor="end"
              fontSize={10} fill={TINTA_BANDA[bandaDe(v)!.clave]}>{v} %</text>
          </g>
        ))}
        {tramos.map((puntos, i) => (
          <polyline key={i} points={puntos} fill="none" stroke="var(--acc)" strokeWidth={1.8}
            strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {serie.map((p: { pct: number }, i: number) => (
          <circle key={i} cx={x(i, serie.length)} cy={y(p.pct, techo)} r={2.4}
            fill={tintaDe(p.pct)}>
            <title>{etiquetaInstante(serie[i])} · {nf(p.pct, 1)} %</title>
          </circle>
        ))}
        {idx.map((i) => (
          <text key={i} x={x(i, serie.length)} y={LIENZO.alto - 10} textAnchor="middle"
            fontSize={9} fill="var(--tx-tenue, #888)">{etiquetaInstante(serie[i])}</text>
        ))}
      </svg>

      <p className="mapa-capas-n">
        {t.suficiente ? (
          <>La serie <b>{t.sentido === 'sube' ? 'sube' : t.sentido === 'baja' ? 'baja' : 'se mantiene estable'}</b>
            {t.variacion_pct != null && t.sentido !== 'estable' && (
              <> · variación del <b>{nf(Math.abs(t.variacion_pct), 1)} %</b> entre el primer y el
                último tercio ({nf(t.inicio_pct!, 1)} % → {nf(t.fin_pct!, 1)} %)</>
            )}. Son {nf(t.n)} puntos.</>
        ) : (
          <><b>No hay tendencia que dibujar:</b> {t.porQue}. Con tan pocos puntos, una flecha diría
            más de lo que el dato sostiene.</>
        )}
      </p>
      <p className="fine">
        Un hueco parte la línea en dos a propósito: unir los dos lados de una hora sin medir dibujaría
        una recta que nadie midió, y esa recta puede cruzar el 100 %.
      </p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// POR LÍNEA — barras y ranking
// ════════════════════════════════════════════════════════════════════════════
const MEDIDAS = [
  { id: 'promedio', rotulo: 'Promedio' },
  { id: 'maximo', rotulo: 'Máximo' },
  { id: 'minimo', rotulo: 'Mínimo' },
  { id: 'ultimo', rotulo: 'Último valor' },
] as const;

function PorLinea({ registros }: { registros: Registro[] }) {
  const [medida, setMedida] = useState<(typeof MEDIDAS)[number]['id']>('promedio');
  const filas = useMemo(() => porLinea(registros as never[]), [registros]);
  const ordenadas = useMemo(
    () => [...filas].sort((a, b) => (b[medida] ?? 0) - (a[medida] ?? 0)), [filas, medida]);
  const techo = techoY(ordenadas.map((f) => f[medida] ?? 0));

  return (
    <div className="tarjeta">
      <p className="mapa-capas-t">Por línea, de mayor a menor</p>
      <div className="acciones" role="group" aria-label="Qué medida se compara">
        {MEDIDAS.map((m) => (
          <button key={m.id} type="button"
            className={'boton chico' + (medida === m.id ? ' activo' : '')}
            aria-pressed={medida === m.id} onClick={() => setMedida(m.id)}>{m.rotulo}</button>
        ))}
      </div>
      <div className="barras">
        {ordenadas.map((f) => {
          const v = f[medida];
          return (
            <div key={f.linea} className="barra-fila">
              <span className="barra-rotulo" title={f.linea}>{f.linea}</span>
              <span className="barra-pista">
                <span className="barra-valor" style={{
                  width: `${Math.min(100, ((v ?? 0) / techo) * 100)}%`,
                  background: tintaDe(v),
                }} />
              </span>
              <span className="barra-cifra">
                {v == null ? '—' : `${nf(v, 1)} %`}
                {f.sobrecargas > 0 && (
                  <span className="fine" title="horas por encima del 100 %"> · {nf(f.sobrecargas)}⚠</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <p className="fine">
        {ordenadas.length} línea(s) · el número tras el ⚠ son las horas por encima del 100 %.
        {medida === 'ultimo' && ' El «último» es el más reciente en el TIEMPO, no el último del archivo.'}
      </p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAPA DE CALOR
// ════════════════════════════════════════════════════════════════════════════
function MapaDeCalor({ registros }: { registros: Registro[] }) {
  const [eje, setEje] = useState<'hora' | 'fecha'>('hora');
  const m = useMemo(() => mapaDeCalor(registros as never[], eje), [registros, eje]);
  if (!m.lineas.length) return null;

  return (
    <div className="tarjeta">
      <p className="mapa-capas-t">Mapa de calor</p>
      <div className="acciones" role="group" aria-label="Eje del mapa de calor">
        <button type="button" className={'boton chico' + (eje === 'hora' ? ' activo' : '')}
          aria-pressed={eje === 'hora'} onClick={() => setEje('hora')}>Por hora</button>
        <button type="button" className={'boton chico' + (eje === 'fecha' ? ' activo' : '')}
          aria-pressed={eje === 'fecha'} onClick={() => setEje('fecha')}>Por fecha</button>
      </div>
      <div className="tabla-scroll">
        <table className="calor">
          <thead>
            <tr><th /> {m.columnas.map((c) => (
              <th key={String(c)}>{eje === 'hora' ? String(c).padStart(2, '0') : String(c).slice(5)}</th>
            ))}</tr>
          </thead>
          <tbody>
            {m.lineas.map((l, i) => (
              <tr key={l}>
                <th scope="row">{l}</th>
                {m.celdas[i].map((celda, j) => (
                  <td key={j} className={celda ? '' : 'sin-dato'}
                    style={celda ? { background: RELLENO_BANDA[celda.banda] } : undefined}
                    title={celda
                      ? `${l} · ${m.columnas[j]} · ${celda.pct == null ? 'sin medida' : `${nf(celda.pct, 1)} %`}`
                        + ` (pico de ${celda.n} lectura/s)`
                      : `${l} · ${m.columnas[j]} · sin medida`} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="fine">
        Cada celda pinta el <b>pico</b> de esa hora, no su promedio: lo que interesa es si llegó a
        tocar una banda alta. La celda en blanco <b>no se midió</b> — y eso no es lo mismo que un cero.
      </p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// DISTRIBUCIÓN Y ATÍPICOS
// ════════════════════════════════════════════════════════════════════════════
function Distribucion({ registros }: { registros: Registro[] }) {
  const tramos = useMemo(() => histograma(registros as never[], 10), [registros]);
  const at = useMemo(() => atipicos(registros as never[]), [registros]);
  const maxN = Math.max(1, ...tramos.map((t) => t.n));

  return (
    <div className="tarjeta">
      <p className="mapa-capas-t">Cómo se reparten las lecturas</p>
      <div className="histograma">
        {tramos.map((t) => (
          <div key={t.desde} className="histo-col"
            title={`${t.desde}–${t.hasta} % · ${nf(t.n)} lectura(s)`}>
            <span className="histo-barra"
              style={{ height: `${(t.n / maxN) * 100}%`, background: RELLENO_BANDA[t.banda] }} />
            <span className="histo-pie">{t.desde}</span>
          </div>
        ))}
      </div>
      {at.suficiente && (
        <p className="mapa-capas-n">
          {at.marcados.length === 0
            ? <>Ninguna lectura se sale del comportamiento habitual (rango {nf(at.limiteBajo!, 1)}–
              {nf(at.limiteAlto!, 1)} %).</>
            : <><b>{nf(at.marcados.length)} lectura(s) atípica(s)</b>, fuera del rango{' '}
              {nf(at.limiteBajo!, 1)}–{nf(at.limiteAlto!, 1)} %:{' '}
              {at.marcados.slice(0, 5).map((v) => `${v.linea} ${v.fecha}${v.hora != null ? ` ${v.hora}h` : ''}`
                + ` (${v.pct == null ? 'sin medida' : `${nf(v.pct, 1)} %`})`).join(' · ')}
              {at.marcados.length > 5 && ` … y ${at.marcados.length - 5} más`}.</>}
        </p>
      )}
      <p className="fine">
        ⚠️ <b>Atípico no es erróneo.</b> Una sobrecarga real es atípica y es justo lo que hay que
        mirar: se señalan, no se descartan de ningún cálculo.
      </p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// LA TABLA
// ════════════════════════════════════════════════════════════════════════════
const COLUMNAS = [
  { id: 'fecha', rotulo: 'Fecha' }, { id: 'hora', rotulo: 'Hora' },
  { id: 'linea', rotulo: 'Línea' }, { id: 'circuito', rotulo: 'Circuito' },
  { id: 'cargabilidad_pct', rotulo: 'Cargabilidad' }, { id: 'corriente_A', rotulo: 'Corriente' },
  { id: 'potenciaActiva_MW', rotulo: 'Potencia' }, { id: 'tension_kV', rotulo: 'Tensión' },
  { id: 'estado', rotulo: 'Estado' }, { id: 'observaciones', rotulo: 'Observaciones' },
] as const;

/**
 * DE DÓNDE VIENE LO QUE SE DESCARGA.
 *
 * ⚠️ El CSV salía mudo. Un archivo con amperios y porcentajes, sin línea, sin
 * fecha, sin las condiciones de la ampacidad y sin la versión del motor, es un
 * archivo que a los seis meses alguien cita en un correo como si fuera un
 * dictamen. Este bloque es lo que permite rastrear cada cifra hasta su fila del
 * Excel original (`99 §ADR-093`).
 */
function procedenciaDelCsv({ nombre, hoja, cuando, lineaAbierta, referencia, veredicto }: {
  nombre: string; hoja?: string; cuando: Date; lineaAbierta?: string;
  referencia: ReturnType<typeof ampacidadDeLinea>;
  veredicto: { contraste: Record<string, unknown> } | null;
}): string[] {
  const r = [
    `Parámetros eléctricos${lineaAbierta ? ` · línea ${lineaAbierta}` : ''}`,
    `Origen: archivo «${nombre}»${hoja ? ` · hoja «${hoja}»` : ''}`
      + ` · leído el ${cuando.toLocaleString('es-CO')}`,
    `Motor de cálculo @lineas/nucleo v${VERSION_DEL_MOTOR}`,
  ];
  if (referencia.ampacidad_A != null) {
    r.push(`Ampacidad de referencia: ${referencia.rotulo}`);
    if (referencia.condiciones.todoAdoptado) {
      r.push('ATENCIÓN: la condición ambiental está ADOPTADA por el sistema, no declarada por el '
        + 'ingeniero. Este archivo es una referencia, no un dictamen firmado.');
    }
  } else {
    r.push(`Ampacidad: no evaluable — ${referencia.motivo}`);
  }
  if (veredicto?.contraste?.comparable) {
    r.push(`Pico del periodo: ${veredicto.contraste.corriente_A} A`
      + ` = ${veredicto.contraste.contraAmpacidad_pct} % de la ampacidad`);
  }
  r.push('El % de la columna «Cargabilidad» viene del ARCHIVO y se calculó contra la capacidad '
    + 'NOMINAL de placa; el % contra la ampacidad es el de este encabezado. No son el mismo número.');
  return r;
}

function TablaDetallada({ registros, nombre, procedencia = [] }: {
  registros: Registro[]; nombre: string; procedencia?: string[];
}) {
  const [busca, setBusca] = useState('');
  const [campo, setCampo] = useState<string>('fecha');
  const [dir, setDir] = useState<Direccion>('asc');
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 25;

  const filtradas = useMemo(() => filtrarPorTexto(registros, busca), [registros, busca]);
  const ordenadas = useMemo(() => ordenarPor(filtradas, campo, dir), [filtradas, campo, dir]);
  const { filas, paginas, pagina: pag } = paginar(ordenadas, pagina, POR_PAGINA);

  const alOrdenar = (id: string) => {
    if (campo === id) setDir(dir === 'asc' ? 'desc' : 'asc'); else { setCampo(id); setDir('asc'); }
    setPagina(1);
  };

  return (
    <div className="tarjeta">
      <p className="mapa-capas-t">Todos los registros</p>
      <div className="acciones">
        <input type="search" placeholder="Buscar en la tabla…" value={busca}
          onChange={(e) => { setBusca(e.target.value); setPagina(1); }} aria-label="Buscar" />
        <button type="button" className="boton chico"
          onClick={() => descargar(`cargabilidad-${nombre.replace(/\.[^.]+$/, '')}.csv`,
            aCsv(COLUMNAS.map((c) => c.rotulo),
              ordenadas.map((f) => COLUMNAS.map((c) => f[c.id] as string | number | null)),
              procedencia))}>
          Descargar lo que se ve ({nf(ordenadas.length)})
        </button>
      </div>
      <div className="tabla-scroll">
        <table className="tabla">
          <thead>
            <tr>{COLUMNAS.map((c) => (
              <th key={c.id}>
                <button type="button" className="th-orden" onClick={() => alOrdenar(c.id)}
                  aria-sort={campo === c.id ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  {c.rotulo}{campo === c.id && (dir === 'asc' ? ' ▲' : ' ▼')}
                </button>
              </th>
            ))}</tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i}>
                <td>{f.fecha}</td>
                <td>{f.hora == null ? '—' : `${String(f.hora).padStart(2, '0')}:00`}</td>
                <td>{f.linea}</td>
                <td>{f.circuito ?? '—'}</td>
                <td style={{ color: tintaDe(f.cargabilidad_pct as number | null) }}>
                  {f.cargabilidad_pct == null ? 'sin medida' : `${nf(f.cargabilidad_pct as number, 1)} %`}
                </td>
                <td>{f.corriente_A == null ? '—' : nf(f.corriente_A as number, 0)}</td>
                <td>{f.potenciaActiva_MW == null ? '—' : nf(f.potenciaActiva_MW as number, 1)}</td>
                <td>{f.tension_kV == null ? '—' : nf(f.tension_kV as number, 1)}</td>
                <td>{f.estado ?? '—'}</td>
                <td>{f.observaciones ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filas.length === 0 && <p className="mapa-capas-n">Nada coincide con «{busca}».</p>}
      {paginas > 1 && (
        <div className="acciones">
          <button type="button" className="boton chico" disabled={pag <= 1}
            onClick={() => setPagina(pag - 1)}>← Anterior</button>
          <span className="fine">Página {pag} de {paginas}</span>
          <button type="button" className="boton chico" disabled={pag >= paginas}
            onClick={() => setPagina(pag + 1)}>Siguiente →</button>
        </div>
      )}
    </div>
  );
}
