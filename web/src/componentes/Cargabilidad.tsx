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
import { useMemo, useRef, useState } from 'react';
import { filasDesde, leerXlsx } from '@lineas/importar/xlsx';
import {
  atipicos, bandaDe, BANDAS, CAMPOS, camposAusentes, detectarMapeo, elegirHoja,
  encontrarCabecera, histograma, mapaDeCalor, porLinea, procesarLote, resumen,
  separarNuevos, serieTemporal, tendencia,
} from '@lineas/nucleo/cargabilidad';
import {
  RELLENO_BANDA, TINTA_BANDA, tintaDe, csvDeErrores, etiquetaInstante, filtrarPorTexto, LIENZO,
  marcasX, marcasY, ordenarPor, paginar, REFERENCIAS, aCsv, techoY, tramosDeLinea, x, y,
  type Direccion,
} from '../vistas/cargabilidadVista';
import {
  cerosAlFinal, CRITERIOS_DE_FASE, pareceAncho, registrosDesdeAncho,
} from '@lineas/nucleo/cargabilidadAncho';
import { empaquetarPorDia, resumirDia } from '@lineas/nucleo/cargabilidad';
import { guardarCarga, huellaDe, resumenesEntre, type Acuse } from '../datos/cargabilidadRepo';
import { nf } from '../vistas/formato';

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
}

/** Bajar un texto como archivo. El navegador ya sabe; solo hay que pedírselo. */
function descargar(nombre: string, texto: string) {
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Cargabilidad({ lineaAbierta, sesion }: {
  lineaAbierta?: string;
  /**
   * Quién está mirando. **Sin ella no se puede guardar**, y la pantalla lo dice
   * en vez de enseñar un botón que va a fallar. El rol se comprueba además en
   * las reglas de la base, que son la última línea (`ADR-004`): esconder un
   * botón no impide nada, solo evita el trabajo perdido.
   */
  sesion?: { rol: string; orgId: string; uid: string };
} = {}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [cargado, setCargado] = useState<Cargado | null>(null);
  const [mapeo, setMapeo] = useState<Mapeo>({});
  const [fallo, setFallo] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  /** Lo que hace falta cuando el archivo viene TRANSPUESTO, de SCADA. */
  const [linea, setLinea] = useState<string>(lineaAbierta ?? '');
  const [criterioFase, setCriterioFase] = useState('maxima');
  const [asignado, setAsignado] = useState<Record<number, string | null>>({});
  /** El guardado y su acuse. `null` = todavía no se ha guardado esta carga. */
  const [guardando, setGuardando] = useState(false);
  const [acuse, setAcuse] = useState<Acuse | null>(null);
  const [falloGuardar, setFalloGuardar] = useState<string | null>(null);
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);

  // ── Leer el archivo ───────────────────────────────────────────────────────
  const alElegir = async (archivo: File | null) => {
    if (!archivo) return;
    setFallo(null); setLeyendo(true);
    try {
      const datos = await archivo.arrayBuffer();
      setBytes(datos);
      setAcuse(null); setFalloGuardar(null);
      const { hojas } = await leerXlsx(datos);
      if (!hojas.length) throw new Error('el archivo no trae ninguna hoja');

      // ⚠️ NI LA PRIMERA HOJA NI LA MÁS GRANDE: la que MÁS CAMPOS RECONOCE
      // (`§ADR-088`). Un libro de operación suele traer portada y notas; abrir
      // por la primera enseña la portada, y abrir por la mayor puede enseñar un
      // registro que no es éste.
      const elegida = elegirHoja(hojas)!;
      const hoja = hojas[elegida.indice];
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

      setAsignado({});
      setLinea(lineaAbierta ?? '');
      setCargado({
        nombre: archivo.name, cuando: new Date(), hoja: hoja.nombre,
        matriz: hoja.matriz, filaCabecera: fila,
        porQue: forma.ancho ? forma.porQue : cab.porQue,
        ancho: forma.ancho, cabeceras, filas,
      });
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

  // ── Procesar con el mapeo que haya AHORA ──────────────────────────────────
  /** La lectura ANCHA, cuando toca. Se recalcula al cambiar línea, señal o criterio. */
  const ancho = useMemo(() => {
    if (!cargado?.ancho) return null;
    return registrosDesdeAncho(cargado.matriz, { linea: linea.trim(), asignado, criterioFase });
  }, [cargado, linea, asignado, criterioFase]);

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
   * GUARDAR LA CARGA. Empaqueta por día, resume y escribe — en ese orden, y con
   * las piezas que ya venían armadas del núcleo. Aquí no se calcula nada.
   */
  const guardar = async () => {
    if (!cargado || !sesion || !registros.length) return;
    setGuardando(true); setFalloGuardar(null);
    try {
      const { dias } = empaquetarPorDia(registros as never[]);
      const resumenes = dias.map((d) => resumirDia(d));
      const fechas = [...new Set(dias.map((d) => d.fecha))].sort();
      const a = await guardarCarga({
        dias: dias as unknown as Record<string, unknown>[],
        resumenes: resumenes as unknown as Record<string, unknown>[],
        carga: {
          nombreArchivo: cargado.nombre, hoja: cargado.hoja,
          huella: bytes ? await huellaDe(bytes) : undefined,
          filasDelArchivo: lote?.resumen?.filas ?? registros.length,
          registrosGuardados: registros.length,
          filasConError: lote?.resumen?.conError ?? 0,
          mapeo: cargado.ancho ? {} : mapeo,
          lineas: [...new Set(dias.map((d) => d.linea))],
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
      <h2>Cargabilidad eléctrica</h2>
      <p className="saludo">
        Cuánta corriente circula por la línea frente a la que puede llevar.{' '}
        <b>Es un dato de OPERACIÓN</b> —viene de SCADA o de un informe— y no se deduce de la
        geometría ni del conductor. No es la utilización mecánica del apoyo: ésa vive en{' '}
        <b>Cargas</b> y es otro veredicto.
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
      ) : sesion.rol !== 'admin' ? (
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
        <input ref={entrada} type="file" accept=".xlsx" hidden
          onChange={(e) => void alElegir(e.target.files?.[0] ?? null)} />
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
        <p className="mapa-capas-n">
          <b>Aquí no hay nada hasta que usted cargue su archivo.</b> Este módulo no trae datos de
          ejemplo ni de demostración: todo lo que aparezca sale de lo que usted entregue, y por eso
          cada cifra se puede rastrear hasta su fila del Excel.
        </p>
      )}

      {cargado && (
        <>
          <p className="mapa-capas-n">
            📄 <b>{cargado.nombre}</b> · hoja «{cargado.hoja}» · {nf(cargado.filas.length)} fila(s)
            {' '}· cargado el {cargado.cuando.toLocaleString('es-CO')}
          </p>

          {cargado.ancho ? (
            <SenalesDelScada cargado={cargado} ancho={ancho} linea={linea} alCambiarLinea={setLinea}
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
              <VistaPrevia registros={registros} />
              {sesion?.rol === 'admin' && registros.length > 0 && (
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
              {tablero && <Tablero t={tablero} />}
              {registros.length > 1 && <Tendencia registros={registros} />}
              {registros.length > 0 && <PorLinea registros={registros} />}
              {registros.length > 0 && <MapaDeCalor registros={registros} />}
              {registros.length > 3 && <Distribucion registros={registros} />}
              {registros.length > 0 && <TablaDetallada registros={registros} nombre={cargado.nombre} />}
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
  sesion: { rol: string; orgId: string; uid: string };
  lineaAbierta?: string;
}) {
  const [periodo, setPeriodo] = useState<string>('7');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [soloEsta, setSoloEsta] = useState(true);
  const [filas, setFilas] = useState<Record<string, unknown>[] | null>(null);
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

  const consultar = async () => {
    const r = rango();
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

      {filas && filas.length > 0 && (
        <>
          <p className="mapa-capas-n">
            <b>{nf(filas.length)} día(s)</b> con dato · pico del periodo{' '}
            {pico
              ? <><b style={{ color: tintaDe(pico.maxima_pct as number) }}>
                {nf(pico.maxima_pct as number, 1)} %</b> el {String(pico.fecha)} en{' '}
                {String(pico.linea)}</>
              : <b>sin medida</b>}
          </p>
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
                <th>Mínima</th><th>Horas con dato</th><th>Sobrecarga</th></tr></thead>
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
                    <td>{nf(f.horasConMedida as number)} de 24</td>
                    <td>{nf((f.porBanda as Record<string, number>)?.sobrecarga ?? 0)} h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filas.length > 60 && (
            <p className="fine">Se muestran 60 de {nf(filas.length)} días.</p>
          )}
        </>
      )}
      <p className="fine">
        Esta consulta lee <b>resúmenes diarios</b>, no las 24 horas de cada día: un año de diez
        líneas son 3.650 lecturas así, y 87.600 de la otra forma.
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
function SenalesDelScada({
  cargado, ancho, linea, alCambiarLinea, lineaAbierta, criterioFase, alCambiarCriterio,
  asignado, alAsignar,
}: {
  cargado: Cargado;
  ancho: ReturnType<typeof registrosDesdeAncho> | null;
  linea: string; alCambiarLinea: (v: string) => void; lineaAbierta?: string;
  criterioFase: string; alCambiarCriterio: (v: string) => void;
  asignado: Record<number, string | null>;
  alAsignar: (a: Record<number, string | null>) => void;
}) {
  const senales = ancho?.senales ?? [];
  const ceros = ancho ? cerosAlFinal(ancho.senales, ancho.eje) : null;
  const fases = senales.filter((s) => s.campo === 'corriente_A' && s.fase).length;

  return (
    <div className="tarjeta">
      <p className="mapa-capas-t">Este archivo viene de SCADA</p>
      <p className="mapa-capas-n">
        No es una tabla: es una <b>matriz transpuesta</b> — {cargado.porQue}. Se lee tal cual, sin
        que usted tenga que reescribirla.
      </p>

      {/* ── 1 · DE QUÉ LÍNEA ES ─────────────────────────────────────────── */}
      <label className="mapa-tiempo-dia">
        <span>Línea *</span>
        <input type="text" value={linea} onChange={(e) => alCambiarLinea(e.target.value)}
          placeholder="p. ej. LN-627" aria-label="De qué línea es este archivo" />
      </label>
      <p className="fine">
        {lineaAbierta
          ? <>Se propone <b>{lineaAbierta}</b> porque es la línea que tiene abierta. Cámbielo si el
            archivo es de otra: el archivo nombra la subestación y la bahía, no la línea.</>
          : <>El archivo nombra la subestación y la bahía, no la línea. Escríbala usted.</>}
      </p>

      {/* ── 2 · QUÉ SEÑAL ES QUÉ ────────────────────────────────────────── */}
      <p className="mapa-capas-t">Qué señal es qué</p>
      <div className="tabla-scroll">
        <table className="tabla">
          <thead><tr><th>Señal del archivo</th><th>Se leyó como</th><th>Primeros valores</th></tr></thead>
          <tbody>
            {senales.map((s) => (
              <tr key={s.fila}>
                <td>{s.etiqueta}</td>
                <td>
                  <select value={s.campo ?? ''}
                    onChange={(e) => alAsignar({ ...asignado, [s.fila]: e.target.value || null })}>
                    <option value="">— no usar —</option>
                    {Object.keys(CAMPOS).filter((c) => CAMPOS[c].tipo === 'numero')
                      .map((c) => (
                        <option key={c} value={c}>
                          {CAMPOS[c].rotulo}{CAMPOS[c].unidad ? ` (${CAMPOS[c].unidad})` : ''}
                        </option>
                      ))}
                  </select>
                  {s.propuesta && asignado[s.fila] === undefined && (
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

function TablaDetallada({ registros, nombre }: { registros: Registro[]; nombre: string }) {
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
              ordenadas.map((f) => COLUMNAS.map((c) => f[c.id] as string | number | null))))}>
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
