// ============================================================================
// componentes/Fotos.tsx — la pestaña «Fotos»: el registro fotográfico de campo
// ----------------------------------------------------------------------------
// QUÉ ES. La segunda pantalla de este sistema cuyo efecto no se puede deshacer.
// `firestore.rules` niega `delete` sobre evidencias y solo deja corregir el pie
// y el estado de subida — NUNCA de qué apoyo cuelga la foto. Una foto colgada
// del punto equivocado se queda ahí para siempre, y además se lee como evidencia
// de algo que no ocurrió ahí: es peor que una foto ausente, porque nadie la
// audita. Todo lo que sigue está construido alrededor de esa frase.
//
// ── POR QUÉ PESTAÑA PROPIA Y NO DENTRO DE LA GALERÍA DE LA FICHA ───────────
//
// Se consideró colgarla de la galería de cada apoyo, que es donde las fotos se
// VEN. Se descartó por tres razones, y la primera sola ya decide:
//
//  1. LA SEGURIDAD DE ESTE DISEÑO VIVE EN VER LAS 28 FILAS A LA VEZ. Lo único
//     que impide colgar una foto del vecino es que él revise el reparto ENTERO
//     antes de que se escriba nada — un desfase se ve porque la fila de al lado
//     no cuadra, no mirando una fila sola. Dentro de la ficha de un apoyo habría
//     que elegir el apoyo PRIMERO, y entonces la comprobación desaparece: el
//     sistema ya no puede enseñar nada que contradiga la elección.
//  2. EL ACTO ES DE LÍNEA, NO DE APOYO. Lo que él tiene en la mano es una
//     carpeta con 205 fotos de 28 puntos. Subirlas apoyo por apoyo son 28
//     sesiones de la misma operación, 28 oportunidades de equivocarse y ningún
//     acuse único que enseñar.
//  3. YA HAY PRECEDENTE Y CONVIENE NO INVENTAR OTRO. «Cargar» sentó la regla:
//     lo que ESCRIBE activos va en su propia pestaña, al final, filtrada por
//     permiso. Dos gestos distintos para dos actos irreversibles obligan a
//     aprender dos cosas donde bastaba una.
//
// La galería de la ficha NO se toca: sigue siendo donde se miran las fotos de un
// apoyo. Esta pestaña es donde entran.
//
// ── AQUÍ NO HAY NI UNA FÓRMULA ──────────────────────────────────────────────
// Misma regla que «Cargar» y que «Exportar». React pinta y pregunta. Quien
// resuelve de qué apoyo es cada foto es `@lineas/importar/evidencias`, que es
// código puro probado en Node y COMPARTIDO con el guion de consola; quien cuenta
// y redacta es `vistas/fotosNuevas.ts`; quien toca la red es `datos/fotos.ts`.
// Si el «106 entrarían nuevas» de esta pantalla tuviera su propia aritmética, el
// día que discrepara del reparto que de verdad se manda nadie sabría cuál mirar.
//
// ── EL MAPA ES EL MISMO PAPEL QUE LEE LA MÁQUINA ───────────────────────────
// Él elige el archivo del mapa con el selector; nunca sube a ningún sitio y
// nunca sale del navegador. La pantalla lo PINTA fila por fila, y el objeto que
// pinta es LITERALMENTE el que se le pasa al emparejador — no hay copia, ni
// traducción, ni «versión bonita para el informe». Si corrige una fila, el botón
// del final descarga el MISMO JSON, con la MISMA forma que ya lee
// `herramientas/subir-evidencias.mjs`. Un documento, dos lectores.
//
// LO QUE ÉL NO VE NUNCA EN ESTA PANTALLA: un identificador interno, una ruta de
// objeto, un JSON, ni el vocabulario de la máquina.
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import type { Apoyo, Evidencia, Linea as TLinea } from '@lineas/contratos';
import { prepararReparto, describirProblema, NOMBRES_INDICE } from '@lineas/importar/evidencias';
import { almacen } from '../datos/enlace';
import { PORTERO, subirFotos, type FotoPorSubir, type IntentoDeSubida } from '../datos/fotos';
import { descargar, selloFecha } from '../exportar/descargar';
import { nf } from '../vistas/formato';
import { puede, type SesionDePantalla } from '../datos/permisos';
import {
  TEXTOS, actaDeFotos, confirmoConLaPalabra, faltasParaSubir, filasDeReparto,
  fraseDelProgreso, frasePedirConfirmacion, lineaDelActa, mapaActualizado,
  pieDelReparto, resumenDelActa, rotuloDelBoton,
  type ActaDeFotos, type FilaDeReparto,
} from '../vistas/fotosNuevas';

/** Una fila del índice del registro, tal como la deja el extractor de la bóveda. */
interface EntradaDeIndice {
  archivo: string;
  carpeta?: string;
  sha256?: string;
  bytes?: number;
  tomadaEn?: string;
}

/** El mapa de carpetas, tal como vive en la bóveda. */
interface MapaDeCarpetas {
  _nota?: string;
  linea?: string;
  carpetas?: { carpeta: string; nombreCanonico: string; yaCargado?: boolean }[];
}

/**
 * El selector de CARPETA. `webkitdirectory` no es estándar pero lo entienden
 * todos los navegadores de escritorio, y React no tipa el atributo. Se declara
 * aquí, en un solo sitio y con su porqué, en vez de esparcir un `as any`.
 */
const SELECTOR_DE_CARPETA = { webkitdirectory: '', directory: '' } as Record<string, string>;

export function Fotos({ linea, apoyos, evidencias = [], sesion }: {
  linea: TLinea;
  apoyos: Apoyo[];
  /** Las fichas que la aplicación YA tiene en memoria. Es la red nº 1. */
  evidencias?: Evidencia[];
  sesion?: SesionDePantalla;
}) {
  const [archivos, setArchivos] = useState<File[]>([]);
  const [indice, setIndice] = useState<EntradaDeIndice[] | null>(null);
  const [mapa, setMapa] = useState<MapaDeCarpetas | null>(null);
  /** Las correcciones que él hizo en la tabla: de carpeta a punto. */
  const [correcciones, setCorrecciones] = useState<Record<string, string>>({});
  const [reviso, setReviso] = useState(false);
  const [palabra, setPalabra] = useState('');
  const [progreso, setProgreso] = useState<string | null>(null);
  const [acta, setActa] = useState<ActaDeFotos | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [carpetasQueEntraron, setCarpetasQueEntraron] = useState<string[]>([]);

  const rol = sesion?.rol ?? 'sin declarar';
  const puedeSubir = puede(sesion, 'evidencias.aportar');

  /**
   * ⚠️ Sin contexto seguro no hay huellas, y sin huellas no se puede saber qué
   * fotos ya están. Se dice con esas palabras en vez de fallar a medias a mitad
   * de la subida.
   */
  const [sinHuellas, setSinHuellas] = useState(false);
  useEffect(() => { setSinHuellas(typeof crypto === 'undefined' || !crypto?.subtle); }, []);

  /** Las huellas de lo que YA está en la base. Ni una lectura más: ya está en memoria. */
  const huellasEnLaBase = useMemo(
    () => [...new Set(evidencias.map((e) => e.sha256).filter(Boolean))] as string[],
    [evidencias],
  );

  /**
   * El mapa CON sus correcciones aplicadas. Es el objeto que se le pasa al
   * emparejador y el mismo que se descarga al final: no hay una segunda versión.
   */
  const mapaVivo = useMemo<MapaDeCarpetas | null>(() => {
    if (!mapa) return null;
    return {
      ...mapa,
      carpetas: (mapa.carpetas ?? []).map((f) => ({
        ...f,
        nombreCanonico: correcciones[f.carpeta] ?? f.nombreCanonico,
      })),
    };
  }, [mapa, correcciones]);

  /**
   * El reparto, recalculado en cada cambio. La MISMA función que corre el guion
   * de consola: no hay dos emparejadores que puedan discrepar.
   */
  const reparto = useMemo(() => {
    if (!indice || !mapaVivo) return null;
    return prepararReparto({
      mapa: mapaVivo,
      entradas: indice,
      apoyos: apoyos as unknown as Record<string, unknown>[],
      huellasEnLaBase,
      codigoLinea: linea.codigo,
      origen: 'registro',
    });
  }, [indice, mapaVivo, apoyos, huellasEnLaBase, linea.codigo]);

  const filas: FilaDeReparto[] = useMemo(
    () => (reparto ? filasDeReparto(reparto.grupos) : []),
    [reparto],
  );

  /** Los puntos que YA están en la base. Es lo único que alimenta el desplegable. */
  const puntosPosibles = useMemo(
    () => apoyos.map((a) => a.nombreNormalizado ?? a.nombreCampo).filter(Boolean) as string[],
    [apoyos],
  );

  const paradas = reparto?.problemas ?? [];
  const nuevas = reparto?.resumen.nuevas ?? 0;

  const faltas = useMemo(() => faltasParaSubir({
    puedeSubir, rol,
    hayIndice: Boolean(indice),
    hayMapa: Boolean(mapa),
    problemas: paradas.length,
    nuevas,
    reviso,
    escribioSubir: confirmoConLaPalabra(palabra),
  }), [puedeSubir, rol, indice, mapa, paradas.length, nuevas, reviso, palabra]);

  const puedePulsar = faltas.length === 0 && !progreso && !sinHuellas && Boolean(PORTERO);

  // ── ① Elegir ──────────────────────────────────────────────────────────────

  async function elegirCarpeta(lista: FileList | null) {
    if (!lista?.length) return;
    setFallo(null); setActa(null);
    const todos = [...lista];
    const elIndice = todos.find((f) => NOMBRES_INDICE.includes(f.name));
    if (!elIndice) {
      setArchivos([]); setIndice(null);
      setFallo(TEXTOS.sinIndice);
      return;
    }
    try {
      const leido = JSON.parse(await elIndice.text()) as EntradaDeIndice[];
      setIndice(Array.isArray(leido) ? leido : []);
      setArchivos(todos.filter((f) => !NOMBRES_INDICE.includes(f.name)));
    } catch {
      setIndice(null); setArchivos([]);
      setFallo('El índice del registro está en esa carpeta, pero no se pudo leer. No se ha hecho nada.');
    }
  }

  async function elegirMapa(lista: FileList | null) {
    const f = lista?.[0];
    if (!f) return;
    setFallo(null); setActa(null); setCorrecciones({});
    try {
      setMapa(JSON.parse(await f.text()) as MapaDeCarpetas);
    } catch {
      setMapa(null);
      setFallo('Ese archivo no es el mapa de carpetas, o está dañado. No se ha hecho nada.');
    }
  }

  function empezarDeCero() {
    setArchivos([]); setIndice(null); setMapa(null); setCorrecciones({});
    setReviso(false); setPalabra(''); setActa(null); setFallo(null); setCarpetasQueEntraron([]);
  }

  // ── ⑤ El acto ─────────────────────────────────────────────────────────────

  async function subir() {
    if (!reparto || !indice) return;
    setFallo(null);
    setProgreso(fraseDelProgreso(0, nuevas, '…'));

    // Solo las que NO están ya. El archivo del disco se busca por su nombre:
    // es la única llave que comparten el índice y lo que el navegador entregó.
    const porNombre = new Map(archivos.map((f) => [f.name, f]));
    const lote: FotoPorSubir[] = [];
    const sinArchivo: { punto: string; archivo: string; motivo: string }[] = [];
    for (const a of reparto.asignaciones as unknown as {
      archivo: string; nombreCanonico: string; apoyoId: string; tomadaEn?: string; yaEnLaBase: boolean;
    }[]) {
      if (a.yaEnLaBase) continue;
      const f = porNombre.get(a.archivo);
      if (!f) {
        sinArchivo.push({
          punto: a.nombreCanonico, archivo: a.archivo,
          motivo: 'el índice lo nombra pero el archivo no estaba en la carpeta que usted eligió',
        });
        continue;
      }
      lote.push({ archivo: f, nombre: a.archivo, punto: a.nombreCanonico, apoyoId: a.apoyoId, tomadaEn: a.tomadaEn });
    }

    try {
      const r = await subirFotos(
        lote,
        { codigoLinea: linea.codigo, lineaId: linea.id, origen: 'registro', huellasEnLaBase },
        (hechas, total, punto) => setProgreso(fraseDelProgreso(hechas, total, punto)),
      );
      const entraron = new Set(
        (r.intentos as IntentoDeSubida[]).filter((t) => t.entro)
          .map((t) => filas.find((x) => x.nombreCanonico === t.punto)?.carpeta ?? '')
          .filter(Boolean),
      );
      setCarpetasQueEntraron([...entraron]);
      setActa(actaDeFotos({
        linea: linea.codigo,
        quien: sesion?.correo ?? 'una cuenta sin correo declarado',
        cuando: new Date().toISOString(),
        intentos: r.intentos,
        fuera: [...sinArchivo, ...r.fuera],
      }));
      setReviso(false);
      setPalabra('');
    } catch (e) {
      // El motivo ENTERO, tal como llegó. Resumirlo en «no se pudo subir» quita
      // justo la información que sirve para saber si algo entró o no entró.
      setFallo(e instanceof Error ? e.message : 'no se pudo completar la subida');
    } finally {
      setProgreso(null);
    }
  }

  function bajarActa() {
    if (!acta) return;
    const lineas = [
      `ACUSE DE SUBIDA DE FOTOGRAFÍAS — ${acta.linea}`,
      `Quien la hizo: ${acta.quien}`,
      `Cuándo: ${acta.cuando}`,
      '',
      resumenDelActa(acta),
      '',
      ...acta.porPunto.map(lineaDelActa),
      '',
      ...(acta.fuera.length ? ['LO QUE QUEDÓ FUERA:', ...acta.fuera.map((f) => `  ${f.punto} · ${f.archivo}: ${f.motivo}`)] : ['No quedó nada fuera.']),
      '',
      'Una fotografía cargada no se puede borrar: las reglas de la base lo prohíben.',
    ];
    descargar(`${linea.codigo}_acuse_de_fotos_${selloFecha()}.txt`, 'text/plain', lineas.join('\n'));
  }

  function bajarMapa() {
    if (!mapa) return;
    descargar(
      `mapa-carpetas-${linea.codigo}.json`,
      'application/json',
      `${JSON.stringify(mapaActualizado(mapaVivo, filas, carpetasQueEntraron), null, 2)}\n`,
    );
  }

  // ══════════════════════════════════════════════════════════════════════════

  return (
    <section className="panel">
      <h2>Subir el registro fotográfico de campo</h2>

      <p className="cargar-quien">
        Entra como <b>{sesion?.correo ?? 'una cuenta sin correo declarado'}</b> · organización{' '}
        <b>{sesion?.orgId || 'sin declarar'}</b> · permiso <b>{rol}</b>.
      </p>

      {!puedeSubir && <p className="alerta">{TEXTOS.sinPermiso}</p>}
      {sinHuellas && <p className="alerta">{TEXTOS.sinContextoSeguro}</p>}
      {!PORTERO && (
        <p className="alerta">
          El servicio que guarda las fotografías no está configurado en esta versión publicada.
          Puede revisar el reparto; el botón del final no se encenderá.
        </p>
      )}

      <p className="advertencia">
        <b>{TEXTOS.noSePuedeBorrar}</b>
      </p>

      {fallo && <p className="alerta">{fallo}</p>}

      {/* ── ① Elegir ─────────────────────────────────────────────────────── */}
      <h2 className="exportar-titulo">1 · Elija la carpeta y el mapa</h2>
      <div className="calc-fila">
        <label className="calc-campo">
          Elegir la carpeta del registro
          <input type="file" multiple className="cargar-archivo" {...SELECTOR_DE_CARPETA}
            onChange={(e) => { void elegirCarpeta(e.target.files); e.target.value = ''; }} />
        </label>
        <label className="calc-campo">
          Elegir el mapa de carpetas
          <input type="file" accept=".json,application/json" className="cargar-archivo"
            onChange={(e) => { void elegirMapa(e.target.files); e.target.value = ''; }} />
        </label>
        {(archivos.length > 0 || mapa) && (
          <button type="button" className="boton chico" onClick={empezarDeCero}>
            Vaciar y empezar de nuevo
          </button>
        )}
      </div>
      <p className="fine">{TEXTOS.nadaSale}</p>
      <p className="fine">{TEXTOS.queEsElMapa}</p>
      {indice && (
        <p className="fine">
          En esa carpeta hay <b>{nf(archivos.length)}</b> archivo(s) y el índice del registro, que
          nombra <b>{nf(indice.length)}</b>.
        </p>
      )}
      {!mapa && indice && <p className="alerta">{TEXTOS.sinMapa}</p>}

      {/* ── ② El reparto ─────────────────────────────────────────────────── */}
      {reparto && filas.length > 0 && (
        <>
          <h2 className="exportar-titulo">2 · El reparto</h2>
          <p className="fine"><b>{TEXTOS.revise}</b></p>
          <div className="tabla-caja">
            <table className="tabla">
              <caption>
                El punto de cada fila lo puede corregir aquí, y lo que se corrija es lo que se
                escribe: esta tabla no es un informe de lo que va a pasar, es lo que va a pasar.
              </caption>
              <thead>
                <tr>
                  <th>De dónde salió</th>
                  <th>Punto</th>
                  <th>Nombre en el GPS</th>
                  <th className="num">Fotos</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.carpeta}>
                    <td><b>{f.carpeta}</b></td>
                    <td>
                      <select className="calc-campo fotos-punto" value={f.nombreCanonico}
                        aria-label={`A qué punto van las fotos de ${f.carpeta}`}
                        onChange={(e) => setCorrecciones((p) => ({ ...p, [f.carpeta]: e.target.value }))}>
                        {puntosPosibles.map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </td>
                    <td>{f.nombreCampo}</td>
                    <td className="num">{nf(f.fotos)}</td>
                    <td>
                      <span className={f.estado === 'entra nueva' ? 'fotos-nueva' : 'fotos-ya'}>{f.estado}</span>
                      {f.esEmpalme && <span className="fotos-empalme">⚠️ EMPALME (no es un apoyo)</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="fine">{pieDelReparto(reparto.resumen)}</p>
          <p className="advertencia">{TEXTOS.noSePuedeBorrar}</p>
        </>
      )}

      {/* ── ③ Las paradas ────────────────────────────────────────────────── */}
      {paradas.length > 0 && (
        <>
          <h2 className="exportar-titulo">3 · Lo que no casa</h2>
          <p className="alerta"><b>{TEXTOS.paradas}</b></p>
          <ul className="cargar-lista">
            {paradas.map((p, i) => <li key={i}>{describirProblema(p)}</li>)}
          </ul>
        </>
      )}

      {/* ── ④ Confirmar en frío ──────────────────────────────────────────── */}
      {reparto && paradas.length === 0 && nuevas > 0 && !acta && (
        <>
          <h2 className="exportar-titulo">4 · Confirmar</h2>
          <label className="calc-campo fotos-casilla">
            <input type="checkbox" checked={reviso} onChange={(e) => setReviso(e.target.checked)} />
            {TEXTOS.heRevisado}
          </label>
          <label className="calc-campo">
            {frasePedirConfirmacion(nuevas)}
            <input type="text" value={palabra} onChange={(e) => setPalabra(e.target.value)}
              autoComplete="off" spellCheck={false} />
          </label>
          <p className="fine">
            Nada viene marcado a propósito. Sobre algo que no se puede deshacer, una casilla ya
            puesta se confirma en vez de decidirse.
          </p>
        </>
      )}

      {/* ── ⑤ El botón, y qué le falta ───────────────────────────────────── */}
      {reparto && !acta && (
        <>
          <button type="button" className="boton" disabled={!puedePulsar} onClick={() => void subir()}>
            {rotuloDelBoton(nuevas)}
          </button>
          {faltas.length > 0 && (
            <ul className="cargar-lista">
              {faltas.map((f) => <li key={f}>{f}</li>)}
            </ul>
          )}
        </>
      )}

      {progreso && (
        <div className="fotos-curso" role="status">
          <p>{progreso}</p>
          <p className="fine">{TEXTOS.siSeCorta}</p>
        </div>
      )}

      {/* ── ⑥ El acuse, que NO se borra solo ─────────────────────────────── */}
      {acta && (
        <>
          <h2 className="exportar-titulo">Acuse</h2>
          <p className="cargar-firmado-t">{resumenDelActa(acta)}</p>
          <ul className="cargar-lista">
            {acta.porPunto.map((p) => <li key={p.punto}>{lineaDelActa(p)}</li>)}
          </ul>
          {acta.fuera.length > 0 && (
            <>
              <p className="alerta">
                {acta.fuera.length} no {acta.fuera.length === 1 ? 'entró' : 'entraron'}. Repita la
                subida cuando quiera: las que ya entraron no se vuelven a subir.
              </p>
              <ul className="cargar-lista">
                {acta.fuera.map((f, i) => <li key={i}>{f.punto} · {f.archivo}: {f.motivo}</li>)}
              </ul>
            </>
          )}
          <div className="calc-fila">
            <button type="button" className="boton chico" onClick={bajarActa}>Descargar el acuse</button>
            <button type="button" className="boton chico" onClick={bajarMapa}>Guardar el mapa de carpetas</button>
            <button type="button" className="boton chico" onClick={() => void almacen.refrescarLinea()}>
              Actualizar la línea
            </button>
          </div>
          <p className="fine">{TEXTOS.porQueNoSeRefresca}</p>
        </>
      )}
    </section>
  );
}
