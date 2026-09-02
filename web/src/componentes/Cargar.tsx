// ============================================================================
// componentes/Cargar.tsx — la pestaña Cargar: puntos nuevos desde el GPS
// ----------------------------------------------------------------------------
// QUÉ ES. La única pantalla de este sistema que CREA activos, y por tanto la
// única cuyo efecto no se puede deshacer: las reglas de la base niegan borrar un
// apoyo y congelan su propiedad. Un punto cargado se queda cargado. Todo lo que
// sigue está construido alrededor de esa frase.
//
// AQUÍ NO HAY NI UNA FÓRMULA. Es la misma regla que Exportar: React pinta y
// pregunta; quien lee el archivo, quien resuelve el nombre, quien coloca el
// punto y quien calcula el antes y el después es `@lineas/importar`, que es
// código puro y probado en Node. Lo que esta pantalla necesita SABER —qué
// distancias enseñar, qué preguntas faltan, cómo se lee una ausencia— vive en
// `vistas/puntosNuevos.ts`, que tampoco sabe que existe React. Si el antes/
// después de esta pantalla tuviera su propia aritmética, el día que discrepara
// de Resumen nadie sabría cuál mirar.
//
// LAS CUATRO DECISIONES DE DISEÑO, Y POR QUÉ:
//
// 1. NADA VIENE PRESELECCIONADO, ni siquiera lo obvio. Un campo ya puesto sobre
//    un acto irreversible es un ancla: quien ve una opción marcada la confirma
//    en vez de decidirla. La casilla de aprobación empieza vacía.
//
// 2. EL SISTEMA NO ELIGE EL VANO. Se enseñan las distancias crudas del punto a
//    cada vecino, en el recorrido de la línea y nunca clasificadas por cercanía:
//    clasificar por distancia es un dictamen disfrazado de lista. El aparato
//    declara ±8 m, y a esa escala la distancia sola no decide de qué lado cae.
//
// 3. UN SOLO BOTÓN, Y DICE QUÉ LE FALTA. Apagado mientras quede una pregunta sin
//    contestar, con la falta nombrada y el punto nombrado. Y detrás una
//    confirmación en frío que dice, con esas palabras, que esto no se deshace.
//
// 4. EL ACUSE CUENTA TAMBIÉN LO QUE QUEDÓ FUERA. «No se cargó» sin el porqué se
//    lee como «se perdió». Lo que él dejó pendiente sigue pendiente, y el papel
//    lo dice.
//
// LO QUE EL INGENIERO NO VE NUNCA EN ESTA PANTALLA: un identificador interno, un
// JSON, ni el vocabulario de la máquina. Él habla de puntos, de sitios y de
// papeles estructurales, que es de lo que responde quien firma.
//
// ── LA QUINTA DECISIÓN (ADR-029): LA PANTALLA RECUERDA, NO PROPONE ──────────
//
//     PROPONER = el sistema deduce algo y lo deja marcado.        PROHIBIDO.
//     RECORDAR = él ya lo decidió, con fecha y con firma, y la pantalla se lo
//                devuelve para que lo RATIFIQUE o lo cambie.
//
// El veto de ADR-028 sigue entero: aquí no se propone el nombre, ni el papel
// estructural, ni en qué vano cae un punto. Lo que se rellena sale de
// `herramientas/decisiones-firmadas.json`, que él firmó, y **jamás se pinta un
// valor recordado sin la fecha que lo respalda**: no existe camino en este
// archivo que pinte lo uno sin lo otro, porque el valor y su sello llegan en el
// mismo objeto desde `vistas/puntosNuevos.ts`.
//
// Las dos preguntas que NO se recuerdan nunca, y la razón de cada una:
//   · CUÁL DE SUS PUNTOS ES ÉSTE — es la que abre la puerta a las otras cuatro.
//     Si se dedujera, las demás se rellenarían solas desde una deducción del
//     sistema vestida con la fecha de él. El recuerdo lo dispara SU elección.
//   · LA APROBACIÓN — aprobar es el acto irreversible; el recuerdo es memoria de
//     una intención. La casilla empieza vacía SIEMPRE, aunque el libro diga
//     «aprobado», y la pantalla dice por qué con esas palabras.
// ============================================================================
import nucleoPkg from '@lineas/nucleo/package.json';
import { useMemo, useState } from 'react';
import type { Apoyo, Linea as TLinea } from '@lineas/contratos';
import { FuncionEstructural, TipoPunto } from '@lineas/contratos';
import { leerGpx } from '@lineas/importar/gpx';
import { planDeCarga } from '@lineas/importar/plan';
import { nombresDisponibles } from '@lineas/importar/identidad';
import { actaHtml } from '@lineas/exportar/acta';
import { almacen } from '../datos/enlace';
import { REGISTRO_NOMBRES } from '../datos/registroSemillas';
import { REGISTRO_DECISIONES } from '../datos/registroDecisiones';
import { leerArchivos, type ArchivoAportado } from '../importar/leerArchivo';
import { descargar, selloFecha } from '../exportar/descargar';
import { nf } from '../vistas/formato';
import {
  AL_FINAL, AL_PRINCIPIO, PRECISION_DECLARADA_M,
  actaDeLaCarga, cifrasDeLaCarga, consecuenciaDeFuncion, CONSECUENCIA_TIPO,
  decisionDeLaFicha, faltantesDe, fichaEnBlanco, nombresParaLaFicha, posicionesPosibles,
  contarPuntos, rotuloDelSitio, textoCota, textoDistancia, textoHora,
  avisoDeLaAprobacion, cambiosSobreLoRecordado, decisionFirmadaDe, fechaDelRecuerdo,
  loDecididoQueEntro, loQueDejoPendiente, loQueYaDecidio, olvidarElRecuerdo,
  recordarEnLaFicha, sellosVivos, vaciarLoRecordado,
  type ActaDeCarga, type CampoRecordado, type FichaDeCarga, type FueraDeLaCarga,
  type OpcionPosicion, type ProcedenciaDeFicha, type NoSePudoRecordar,
  type ResultadoDeCarga, type RetratoDeLinea, type SelloDeCampo,
} from '../vistas/puntosNuevos';

/** Lo que `@lineas/importar/plan` devuelve, con la forma que esta pantalla usa. */
interface PlanEnPantalla {
  documentos: Record<string, unknown>[];
  ignorados: FueraDeLaCarga[];
  bloqueados: FueraDeLaCarga[];
  antes: RetratoDeLinea;
  despues: RetratoDeLinea;
}

/** Lo que se supo de cada archivo aportado. Viaja al acta tal cual. */
interface ArchivoEnPantalla {
  nombre: string;
  creator: string | null;
  puntos: number;
  avisos: { tipo: string; mensaje: string }[];
  fallo?: string;
}

/** Qué se le pregunta a cada punto, en el mismo idioma en que él contesta. */
const PREGUNTAS = {
  nombre: '¿Cuál de sus puntos aprobados es éste?',
  tipo: '¿Qué es?',
  sitio: '¿Dónde va?',
  funcion: '¿Qué papel estructural cumple?',
  aprueba: '¿Lo aprueba?',
} as const;

export function Cargar({ linea, apoyos, sesion }: {
  linea: TLinea;
  apoyos: Apoyo[];
  /** Quién entró y con qué permiso. Se enseña ANTES de nada: ver bloque ①. */
  sesion: { correo: string | null; rol: string; orgId: string; uid: string };
}) {
  const [archivos, setArchivos] = useState<ArchivoEnPantalla[]>([]);
  const [fichas, setFichas] = useState<FichaDeCarga[]>([]);
  const [confirmando, setConfirmando] = useState(false);
  const [enCurso, setEnCurso] = useState(false);
  const [acuse, setAcuse] = useState<ResultadoDeCarga | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  /** El acta de la última carga, ya armada. Se guarda para poder rebajarla. */
  const [acta, setActa] = useState<ActaDeCarga | null>(null);
  /**
   * De dónde sale cada valor que la ficha NO contestó hoy: quién lo decidió y
   * cuándo. Vive aparte de la ficha a propósito — la ficha son sus CINCO
   * respuestas, y esto es la memoria de lo que ya había firmado. Mezclarlos
   * haría imposible distinguir lo que contestó hoy de lo que se le recordó.
   */
  const [recuerdos, setRecuerdos] = useState<Record<string, {
    procedencia: ProcedenciaDeFicha; noSePudoPoner: NoSePudoRecordar[];
  }>>({});

  const esAdmin = sesion.rol === 'admin';

  // Los nombres del libro de esta línea que todavía no están puestos. Es lo
  // ÚNICO que alimenta el desplegable: así no hay forma de escribir un nombre
  // que no exista ni de poner dos veces el mismo punto.
  const disponibles = useMemo(
    () => nombresDisponibles(REGISTRO_NOMBRES, linea.codigo, apoyos) as string[],
    [linea.codigo, apoyos],
  );

  // Lo que él YA decidió sobre esta línea y todavía no está cargado, y lo que
  // dejó pendiente de verificar en campo. Se lee del libro del repositorio, que
  // la aplicación no puede escribir: por eso «decidido por usted el 16 de
  // agosto» es comprobable y no una afirmación del sistema sobre sí mismo.
  // Se filtra por los nombres que siguen DISPONIBLES: en cuanto un punto está
  // cargado, la verdad es la base — cargado manda sobre firmado.
  const yaDecidido = useMemo(
    () => loQueYaDecidio(REGISTRO_DECISIONES, linea.codigo, disponibles),
    [linea.codigo, disponibles],
  );
  const dejadoPendiente = useMemo(
    () => loQueDejoPendiente(REGISTRO_DECISIONES, linea.codigo),
    [linea.codigo],
  );

  /**
   * El plan completo, recalculado en cada tecla. Solo entran las fichas SIN
   * preguntas pendientes: una ficha a medio contestar no es un problema, es un
   * formulario en curso, y sacarla como «bloqueada» mientras él escribe sería
   * regañarle por no haber terminado.
   *
   * El motivo de un fallo VIAJA dentro del resultado, no a un `useState`:
   * escribir estado mientras se pinta es la receta del repintado infinito, y
   * aquí esto se recalcula con cada tecla.
   */
  const { plan, noSePudoPreparar } = useMemo(() => {
    const listas = fichas.filter((f) => faltantesDe(f).length === 0);
    try {
      const p = planDeCarga(apoyos, listas.map(decisionDeLaFicha), {
        codigoLinea: linea.codigo,
        creadoPor: sesion.uid,
        registro: REGISTRO_NOMBRES,
      }) as PlanEnPantalla;
      return { plan: p, noSePudoPreparar: null as string | null };
    } catch (e) {
      // Una línea sin ningún punto cargado llega hasta aquí: esta pantalla
      // AÑADE a una línea que ya existe, no la siembra. Se dice con el motivo
      // entero en vez de pintar un plan vacío, que parecería que sí se puede.
      return {
        plan: null,
        noSePudoPreparar: e instanceof Error ? e.message : 'no se pudo preparar la carga',
      };
    }
  }, [apoyos, fichas, linea.codigo, sesion.uid]);

  const cifras = useMemo(
    () => (plan ? cifrasDeLaCarga(plan.antes, plan.despues) : []),
    [plan],
  );

  /**
   * La línea que cierra el círculo en el acuse: de lo que él decidió en su día,
   * qué entró hoy y qué sigue sin cargar porque él lo dejó pendiente.
   *
   * Sin ella, un punto que él decidió hace días y hoy no entró desaparece de la
   * pantalla sin una sola frase que lo nombre — y eso se lee como perdido.
   */
  const cierreDeLoDecidido = useMemo(
    () => (acuse ? loDecididoQueEntro(yaDecidido, acuse.escritos, dejadoPendiente) : null),
    [acuse, yaDecidido, dejadoPendiente],
  );

  // ── ② Aportar los archivos ────────────────────────────────────────────────

  async function aportar(lista: FileList | null) {
    if (!lista?.length) return;
    setFallo(null);
    setAcuse(null);
    setActa(null);
    const leidos = await leerArchivos([...lista] as ArchivoAportado[]);

    const nuevosArchivos: ArchivoEnPantalla[] = [];
    const nuevasFichas: FichaDeCarga[] = [];

    for (const a of leidos) {
      if (a.texto === null) {
        nuevosArchivos.push({ nombre: a.nombre, creator: null, puntos: 0, avisos: [], fallo: a.fallo });
        continue;
      }
      const { creator, waypoints, avisos } = leerGpx(a.texto) as {
        creator: string | null;
        waypoints: { nombreCampo?: string; lat: number; lon: number; ele?: number; utc?: string }[];
        avisos: { tipo: string; mensaje: string }[];
      };
      nuevosArchivos.push({ nombre: a.nombre, creator, puntos: waypoints.length, avisos });
      waypoints.forEach((w, i) => {
        nuevasFichas.push(fichaEnBlanco(a.nombre, `${a.nombre}#${i}`, w));
      });
    }

    // Se ACUMULA: puede aportar el archivo de un día y luego el del siguiente.
    // Lo ya contestado no se pierde por aportar otro archivo.
    setArchivos((p) => [...p, ...nuevosArchivos]);
    setFichas((p) => [...p, ...nuevasFichas]);
  }

  const responder = (clave: string, parche: Partial<FichaDeCarga>) =>
    setFichas((p) => p.map((f) => (f.clave === clave ? { ...f, ...parche } : f)));

  /**
   * Él dice cuál de sus puntos es éste — y SOLO entonces la pantalla le recuerda
   * lo que decidió bajo ese nombre.
   *
   * EL SISTEMA NO EMPAREJA NADA: no busca por el nombre que grabó el aparato
   * (es dato del levantamiento, y ya se ha equivocado) ni por cercanía (el
   * aparato declara ±8 m; ordenar por distancia es un dictamen disfrazado de
   * lista). El emparejamiento lo hace su elección.
   *
   * Al cambiar de nombre se retira lo que había puesto el recuerdo ANTERIOR y
   * solo eso: lo que contestó él con sus manos se queda donde está.
   */
  function elegirNombre(clave: string, nombre: string) {
    const f = fichas.find((x) => x.clave === clave);
    if (!f) return;
    const sitios = posicionesPosibles(apoyos, f.lat, f.lon);
    const limpia = { ...olvidarElRecuerdo(f, recuerdos[clave]?.procedencia ?? {}), nombreCanonico: nombre };
    const r = recordarEnLaFicha(limpia, decisionFirmadaDe(REGISTRO_DECISIONES, linea.codigo, nombre), sitios);
    setFichas((p) => p.map((x) => (x.clave === clave ? r.ficha : x)));
    setRecuerdos((p) => ({ ...p, [clave]: { procedencia: r.procedencia, noSePudoPoner: r.noSePudoPoner } }));
  }

  /**
   * «Cambiar» un campo recordado: se vacía y él contesta de nuevo.
   *
   * El sello NO se borra — se conserva para poder decirle que lo que decidió
   * aquel día sigue siendo un hecho y que el acta llevará las dos cosas.
   * Cambiar tiene que costar exactamente un clic, igual que ratificar.
   */
  const cambiar = (clave: string, campo: CampoRecordado) =>
    setFichas((p) => p.map((f) => (f.clave === clave ? vaciarLoRecordado(f, campo) : f)));

  function empezarDeCero() {
    setArchivos([]);
    setFichas([]);
    setRecuerdos({});
    setConfirmando(false);
    setAcuse(null);
    setActa(null);
    setFallo(null);
  }

  // ── ⑥ Qué falta para poder pulsar ────────────────────────────────────────

  /**
   * Lo que impide cargar, dicho por su nombre y con el punto nombrado.
   *
   * Un botón apagado sin motivo es lo más caro que hay en una pantalla que se
   * usa una vez cada tres meses: quien no sabe qué le falta, recarga la página
   * y vuelve a empezar.
   */
  const faltas = useMemo(() => {
    const xs: string[] = [];
    if (!esAdmin) {
      xs.push(`su sesión entró con el permiso «${sesion.rol}», y crear puntos de una línea es acto de administración`);
    }
    for (const f of fichas) {
      const faltan = faltantesDe(f);
      if (!faltan.length) continue;
      const quien = f.nombreCanonico || f.nombreCampo || 'un punto del archivo';
      xs.push(`de «${quien}» falta contestar: ${faltan.join(' · ')}`);
    }
    if (fichas.length && !fichas.some((f) => f.aprobado)) {
      xs.push('no ha aprobado ningún punto todavía: la casilla de cada ficha empieza vacía a propósito');
    }
    return xs;
  }, [esAdmin, fichas, sesion.rol]);

  const cuantos = plan?.documentos.length ?? 0;
  const puedeCargar = esAdmin && !faltas.length && cuantos > 0 && !enCurso;

  // ── El acto ───────────────────────────────────────────────────────────────

  async function cargar() {
    if (!plan) return;
    setEnCurso(true);
    setFallo(null);
    try {
      const resultado = await almacen.cargarPuntos(plan.documentos);
      setAcuse(resultado);
      setConfirmando(false);
      setActa(actaDeLaCarga({
        linea: { codigo: linea.codigo, nombre: linea.nombre, tensionNominal_kV: linea.tensionNominal_kV },
        quien: { correo: sesion.correo, organizacion: sesion.orgId, rol: sesion.rol },
        cuando: new Date().toISOString(),
        archivos: archivos.map((a) => ({ nombre: a.nombre, creator: a.creator, puntos: a.puntos })),
        fichas,
        ignorados: plan.ignorados,
        bloqueados: plan.bloqueados,
        resultado,
        cifras,
        // Lo que ya había firmado sobre cada punto. El acta es el único papel
        // que puede llevar las dos cosas: lo que decidió aquel día y lo que
        // cargó hoy.
        sellos: Object.fromEntries(
          Object.entries(recuerdos).map(([k, v]) => [k, v.procedencia])),
        // El acta promete «el mismo motor»: aquí se dice cuál (`99 §ADR-092`).
        versionNucleo: nucleoPkg.version,
      }));
    } catch (e) {
      // El motivo entero, tal como llegó. Resumirlo aquí en «no se pudo cargar»
      // sería quitarle la única información que sirve para saber si el punto
      // entró o no entró.
      setFallo(e instanceof Error ? e.message : 'no se pudo completar la carga');
      setConfirmando(false);
    } finally {
      setEnCurso(false);
    }
  }

  function bajarActa() {
    if (!acta) return;
    try {
      descargar(
        `${linea.codigo}_acta_de_carga_${selloFecha()}.html`,
        'text/html',
        actaHtml(acta),
      );
    } catch (e) {
      setFallo('No se pudo generar el acta. El detalle técnico quedó en la consola del navegador.');
      console.error('acta de carga:', e);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════

  return (
    <section className="panel">
      <h2>Cargar puntos nuevos a la línea</h2>

      {/* ── ① Quién es usted ────────────────────────────────────────────── */}
      <p className="cargar-quien">
        Entra como <b>{sesion.correo ?? 'una cuenta sin correo declarado'}</b> · organización{' '}
        <b>{sesion.orgId || 'sin declarar'}</b> · permiso <b>{sesion.rol || 'sin declarar'}</b>.
      </p>
      <p className="fine">
        Se dice aquí, antes de nada, porque es la base la que decide si esta carga entra: si el
        permiso no fuera el correcto, más vale saberlo ahora que después de media hora de trabajo.
      </p>

      {!esAdmin && (
        <p className="alerta">
          Crear puntos de una línea es acto de administración, y esta sesión no lo es. Puede mirar
          esta pantalla; el botón del final no se encenderá.
        </p>
      )}

      <p className="advertencia">
        <b>Esto no se puede deshacer.</b> Un punto cargado no se puede borrar ni corregir desde la
        aplicación. Está diseñado así para que nadie borre historia: de cada punto cuelgan sus fotos
        y su expediente de falla.
      </p>

      {noSePudoPreparar && (
        <p className="alerta">
          <b>No se puede preparar la carga:</b> {noSePudoPreparar}
        </p>
      )}

      {/* ── ①bis Lo que usted ya decidió ────────────────────────────────────
          Visible desde que abre, antes de aportar ningún archivo. No es una
          sugerencia del sistema: son filas que él firmó, con su fecha, en el
          libro del repositorio — que la aplicación LEE y no puede escribir. */}
      {yaDecidido.length > 0 && (
        <div className="cargar-firmado">
          <p className="cargar-firmado-t">Lo que usted ya decidió sobre esta línea y todavía no está cargado</p>
          <p>
            Esto no es una sugerencia del sistema: son decisiones suyas, con su fecha. Aquí no
            aparece nada que el sistema haya deducido — si de un dato no se puede decir quién lo
            decidió y cuándo, no se enseña.
          </p>
          <ul className="cargar-lista">
            {yaDecidido.map((d) => <li key={d.sobre}>{d.texto}</li>)}
          </ul>
        </div>
      )}

      {/* Lo que él dejó PENDIENTE. Sin casilla, sin botón, y sin contarse en
          ningún sitio donde se cuenten puntos por cargar. */}
      {dejadoPendiente.length > 0 && (
        <div className="cargar-pendiente">
          {dejadoPendiente.map((p) => <p key={p.sobre}>{p.texto}</p>)}
          <p>
            Desde esta pantalla no se puede cargar, y no es una avería. Ese punto todavía no tiene
            nombre emitido en el libro del repositorio, así que aquí no se le puede dar identidad; y
            además va antes del primer punto cargado, que es un camino que todavía no existe. Cuando
            usted lo verifique en campo, se abre por el repositorio, no por aquí.
          </p>
        </div>
      )}

      {/* ── ② Aportar el archivo ────────────────────────────────────────── */}
      <h2 className="exportar-titulo">1 · Aporte los archivos del GPS</h2>
      <div className="calc-fila">
        <label className="calc-campo">
          Archivos descargados del aparato (.gpx)
          <input
            type="file"
            accept=".gpx,application/gpx+xml"
            multiple
            className="cargar-archivo"
            onChange={(e) => { void aportar(e.target.files); e.target.value = ''; }}
          />
        </label>
        {(archivos.length > 0 || fichas.length > 0) && (
          <button type="button" className="boton chico" onClick={empezarDeCero}>
            Vaciar y empezar de nuevo
          </button>
        )}
      </div>
      <p className="fine">
        <b>El archivo no sube a ningún sitio:</b> se lee aquí, en su computador. Lo que viaja a la
        base son los puntos que usted apruebe, uno por uno — nunca el archivo.
      </p>

      {/* ── ③ Qué traía el archivo ──────────────────────────────────────── */}
      {archivos.length > 0 && (
        <>
          <h2 className="exportar-titulo">2 · Qué traían los archivos</h2>
          <div className="tabla-caja">
            <table className="tabla">
              <caption>
                Esto es lectura, no decisión: aquí todavía no se carga nada. Los huecos se declaran
                antes de ofrecer ningún botón.
              </caption>
              <thead>
                <tr>
                  <th>Archivo</th>
                  <th>Aparato que lo escribió</th>
                  <th className="num">Puntos marcados</th>
                  <th>Lo que hay que saber</th>
                </tr>
              </thead>
              <tbody>
                {archivos.map((a) => (
                  <tr key={a.nombre}>
                    <td><b>{a.nombre}</b></td>
                    <td>{a.creator ?? 'no lo declara'}</td>
                    <td className="num">{nf(a.puntos)}</td>
                    <td>
                      {a.fallo && <span className="cargar-hueco">no se pudo leer: {a.fallo}</span>}
                      {!a.fallo && a.avisos.length === 0 && 'sin nada que declarar'}
                      {a.avisos.map((v) => (
                        <span key={v.tipo} className="cargar-hueco">{v.mensaje}</span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── ④ Una ficha por punto ───────────────────────────────────────── */}
      {fichas.length > 0 && (
        <>
          <h2 className="exportar-titulo">3 · Un punto, cinco preguntas</h2>
          <p className="fine">
            Ninguna respuesta viene puesta, tampoco la aprobación. Sobre algo que no se puede
            deshacer, una casilla ya marcada se confirma en vez de decidirse.
          </p>
          {fichas.map((f) => (
            <FichaPunto
              key={f.clave}
              ficha={f}
              apoyos={apoyos}
              nombres={nombresParaLaFicha(disponibles, fichas, f.clave)}
              procedencia={recuerdos[f.clave]?.procedencia ?? {}}
              noSePudoPoner={recuerdos[f.clave]?.noSePudoPoner ?? []}
              avisoAprobacion={avisoDeLaAprobacion(
                decisionFirmadaDe(REGISTRO_DECISIONES, linea.codigo, f.nombreCanonico))}
              alElegirNombre={(n) => elegirNombre(f.clave, n)}
              alCambiar={(campo) => cambiar(f.clave, campo)}
              alResponder={(parche) => responder(f.clave, parche)}
            />
          ))}
        </>
      )}

      {/* ── ⑤ Antes y después ─────────────────────────────────────────────
          Solo cuando ya hay algún punto en pantalla. Antes de aportar nada, esta
          tabla enseñaría la línea contra sí misma —doce filas diciendo «no se
          mueve»— y la mitad de la pantalla se leería como si ya hubiera pasado
          algo. */}
      {plan && fichas.length > 0 && cifras.length > 0 && (
        <>
          <h2 className="exportar-titulo">4 · Cómo quedaría la línea</h2>
          <p className="fine">
            Estas cifras salen del <b>mismo motor</b> que pinta las demás pestañas, corrido dos
            veces: una con la línea como está y otra con los puntos nuevos dentro. Se declara también
            lo que <b>no</b> se mueve — que algo siga igual es información, no un hueco.
          </p>
          <div className="tabla-caja">
            <table className="tabla">
              <caption>Antes y después, con {contarPuntos(cuantos)} que entrarían.</caption>
              <thead>
                <tr>
                  <th>Cifra</th>
                  <th className="num">Hoy</th>
                  <th className="num">Quedaría</th>
                  <th>¿Se mueve?</th>
                </tr>
              </thead>
              <tbody>
                {cifras.map((c) => (
                  <tr key={c.rotulo}>
                    <td>
                      {c.rotulo}
                      {c.porQue && <span className="cargar-consecuencia">{c.porQue}</span>}
                    </td>
                    <td className="num">{c.antes}</td>
                    <td className={c.cambia ? 'num destaca' : 'num'}>{c.despues}</td>
                    <td>{c.cambia ? 'sí' : 'no se mueve'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Lo que hoy NO se puede cargar, con el motivo entero */}
      {plan && plan.bloqueados.length > 0 && (
        <div className="aviso">
          <b>Hoy no se puede cargar {contarPuntos(plan.bloqueados.length)}</b>, y aquí está por qué.
          Los demás sí se pueden: negarle los buenos por culpa de éstos sería castigarle por haber
          traído más información.
          <ul className="cargar-lista">
            {plan.bloqueados.map((b, i) => (
              <li key={`${b.nombreCanonico ?? b.nombreCampo ?? 'punto'}-${i}`}>
                <b>{b.nombreCanonico ?? b.nombreCampo ?? 'un punto del archivo'}:</b> {b.motivo}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Lo que él dejó pendiente. Se enseña ANTES de cargar, no solo después */}
      {plan && plan.ignorados.length > 0 && (
        <p className="fine">
          <b>Queda fuera {contarPuntos(plan.ignorados.length)}</b> porque usted no lo aprobó:{' '}
          {plan.ignorados.map((x) => `«${x.nombreCanonico ?? x.nombreCampo ?? 'sin emparejar'}» (${x.motivo})`).join(' · ')}.
          Siguen pendientes: no se pierden, y el acta lo dirá.
        </p>
      )}

      {/* ── ⑥ Un solo botón ─────────────────────────────────────────────── */}
      {fichas.length > 0 && !acuse && (
        <>
          <h2 className="exportar-titulo">5 · Cargar</h2>
          {faltas.length > 0 && (
            <div className="aviso">
              <b>El botón está apagado porque falta esto:</b>
              <ul className="cargar-lista">
                {faltas.map((x) => <li key={x}>{x}</li>)}
              </ul>
            </div>
          )}
          {!confirmando && (
            <button
              type="button"
              className="boton"
              disabled={!puedeCargar}
              onClick={() => setConfirmando(true)}
            >
              Cargar {contarPuntos(cuantos)} que ha aprobado
            </button>
          )}

          {confirmando && (
            <div className="cargar-confirmar">
              <p className="cargar-confirmar-t">Antes de escribir, léalo una vez más</p>
              <p>
                Se van a crear <b>{contarPuntos(cuantos)}</b> en {linea.codigo}:{' '}
                {plan?.documentos.map((d) => String(d.nombreNormalizado)).join(' · ')}.
              </p>
              <p>
                <b>Esto no se puede deshacer.</b> Un punto cargado no se puede borrar ni corregir
                desde aquí; está diseñado así para que nadie borre historia. Si algo está mal,
                arreglarlo exige la llave de administración desde el repositorio.
              </p>
              <div className="rca-guardar">
                <button type="button" className="boton" disabled={enCurso} onClick={() => void cargar()}>
                  {enCurso ? 'Escribiendo…' : `Sí, cargar ${contarPuntos(cuantos)}`}
                </button>
                <button type="button" className="boton chico" disabled={enCurso} onClick={() => setConfirmando(false)}>
                  No, volver a revisar
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── ⑦ El acuse ──────────────────────────────────────────────────── */}
      <div aria-live="polite">
        {fallo && <p className="alerta">{fallo}</p>}

        {acuse && (
          <>
            <h2 className="exportar-titulo">Lo que pasó</h2>
            {acuse.escritos.length > 0
              ? (
                <p className="ok">
                  <b>Se cargó {contarPuntos(acuse.escritos.length)}:</b>{' '}
                  {acuse.escritos.join(' · ')}. Quedó escrito en la base a su nombre.
                  {' '}Las demás pestañas siguen enseñando la línea tal como estaba antes de esta
                  carga: se refrescan cuando usted lo pida, para no borrar este acuse antes de que
                  lo lea ni quitarle de las manos el acta.
                </p>
              )
              : <p className="alerta"><b>No se cargó ningún punto.</b> La línea quedó como estaba.</p>}

            {cierreDeLoDecidido && <p className="cargar-firmado">{cierreDeLoDecidido}</p>}

            {acuse.yaEstaban.length > 0 && (
              <p className="aviso">
                <b>Ya estaban en la línea y no se volvieron a escribir:</b>{' '}
                {acuse.yaEstaban.join(' · ')}. Volver a escribirlos habría pisado el punto que ya
                existe, con sus fotos y su expediente.
              </p>
            )}

            {acuse.rechazados.length > 0 && (
              <div className="alerta">
                <b>No cumplían el molde de los datos y NO llegaron a la base:</b>
                <ul className="cargar-lista">
                  {acuse.rechazados.map((x) => <li key={x.nombre}><b>{x.nombre}:</b> {x.motivo}</li>)}
                </ul>
              </div>
            )}

            {acuse.escritos.length > 0 && (
              <p>
                <button
                  type="button"
                  className="boton"
                  onClick={() => { void almacen.refrescarLinea(); }}
                >
                  Ver la línea ya con los puntos nuevos
                </button>
                <span className="fine">
                  {' '}— vuelve a leer la línea de la base. Este acuse desaparece al hacerlo, así que
                  descargue antes el acta si la quiere.
                </span>
              </p>
            )}

            {plan && plan.ignorados.length > 0 && (
              <p className="fine">
                <b>NO se cargó</b>, porque usted lo dejó pendiente:{' '}
                {plan.ignorados.map((x) => `«${x.nombreCanonico ?? x.nombreCampo ?? 'sin emparejar'}» — ${x.motivo}`).join(' · ')}.
                Sigue pendiente; no se ha perdido.
              </p>
            )}

            {(() => {
              const supuestas = fichas.filter(
                (f) => acuse.escritos.includes(f.nombreCanonico) && !f.funcionConfirmada);
              return supuestas.length > 0 && (
                <p className="aviso">
                  <b>El papel estructural quedó SUPUESTO</b> —no firmado por usted— en:{' '}
                  {supuestas.map((f) => `${f.nombreCanonico} (${f.funcionEstructural})`).join(' · ')}.
                  La ficha de cada uno lo dirá mientras siga sin confirmar.
                </p>
              );
            })()}

            <p className="fine">
              El molde de los datos no tiene dónde guardar <b>por qué</b> decidió cada cosa. El acta
              sí. Es el único sitio donde ese razonamiento queda escrito: descárguela y archívela.
            </p>
            <div className="rca-guardar">
              <button type="button" className="boton" disabled={!acta} onClick={bajarActa}>
                ⬇ Descargar el acta de esta carga (HTML, se abre sin internet)
              </button>
              <button type="button" className="boton chico" onClick={empezarDeCero}>
                Cargar otro archivo
              </button>
            </div>
          </>
        )}
      </div>

      <p className="advertencia">
        <b>Lo que esta pantalla no puede hacer, a propósito:</b> no estrena nombres. Solo carga
        puntos cuyo nombre ya está anotado en el libro del repositorio, porque de ese nombre cuelga
        para siempre la identidad del punto, sus fotos y su expediente. Un nombre que se estrena
        exige un cambio en el repositorio antes de poder cargarse — es el único sitio donde este
        recorte le cuesta algo, y se prefiere a que una pantalla pueda estrenar identidades.
      </p>
    </section>
  );
}

// ── El sello de un valor recordado ──────────────────────────────────────────

/**
 * Un valor que él decidió en su día, SIEMPRE pegado a la fecha que lo respalda.
 *
 * ES LA PIEZA QUE HACE QUE ESTO SEA MEMORIA Y NO DICTAMEN. El valor y su sello
 * llegan dentro del mismo objeto desde `vistas/puntosNuevos.ts`, de modo que no
 * existe forma de pintar el uno sin el otro: si no hay sello, este componente no
 * pinta nada. Y al lado va «Cambiar», que lo vacía — cambiar cuesta un clic,
 * exactamente lo mismo que ratificar.
 */
function SelloRecordado({ sello, alCambiar }: {
  sello: SelloDeCampo | undefined;
  alCambiar: () => void;
}) {
  if (!sello) return null;
  return (
    <p className="cargar-sello">
      <b>{sello.comoSeLee}</b> — {sello.sello}.{' '}
      <button type="button" className="boton chico" onClick={alCambiar}>Cambiar</button>
    </p>
  );
}

// ── La ficha de UN punto ────────────────────────────────────────────────────

function FichaPunto({
  ficha, apoyos, nombres, procedencia, noSePudoPoner, avisoAprobacion,
  alElegirNombre, alCambiar, alResponder,
}: {
  ficha: FichaDeCarga;
  apoyos: Apoyo[];
  nombres: string[];
  /** De dónde sale cada valor que él no contestó hoy. Puede estar vacío. */
  procedencia: ProcedenciaDeFicha;
  /** Lo que el libro decidió y esta pantalla NO puso, con el motivo. */
  noSePudoPoner: NoSePudoRecordar[];
  avisoAprobacion: string;
  alElegirNombre: (nombre: string) => void;
  alCambiar: (campo: CampoRecordado) => void;
  alResponder: (parche: Partial<FichaDeCarga>) => void;
}) {
  // Las distancias crudas a cada vecino. Las calcula el núcleo, desde
  // `vistas/puntosNuevos`: aquí no hay geodesia.
  const sitios: OpcionPosicion[] = useMemo(
    () => posicionesPosibles(apoyos, ficha.lat, ficha.lon),
    [apoyos, ficha.lat, ficha.lon],
  );
  const faltan = faltantesDe(ficha);

  // Los sellos que HOY se pueden pintar: solo los de campos que siguen tal como
  // él los decidió. Un campo que cambió deja de tener sello y pasa a tener aviso
  // de cambio — son dos cosas distintas y se ven distintas.
  const vivos = useMemo(() => sellosVivos(ficha, procedencia), [ficha, procedencia]);
  const cambios = useMemo(() => cambiosSobreLoRecordado(ficha, procedencia), [ficha, procedencia]);
  const avisoDe = (campo: CampoRecordado) => cambios.find((c) => c.campo === campo)?.aviso;
  const hayRecuerdo = Object.keys(procedencia).length > 0;

  return (
    <div className="cargar-ficha">
      <div className="cargar-cab">
        <b>{ficha.nombreCampo || 'punto sin nombre en el aparato'}</b>
        <span className="pill">{ficha.archivo}</span>
      </div>
      <p className="fine">
        Como lo grabó el aparato · {textoHora(ficha.utc)} · cota: {textoCota(ficha.ele)} ·
        el aparato declara ±{nf(PRECISION_DECLARADA_M)} m.
      </p>

      {/* Pregunta 1 — el nombre. No se propone ninguno: de ese nombre nace la
          identidad permanente del punto, y un campo prerrellenado sobre un acto
          que no se puede deshacer es un ancla. */}
      <label className="cargar-pregunta">
        <span className="cargar-rotulo">{PREGUNTAS.nombre}</span>
        <select
          className="rca-select"
          value={ficha.nombreCanonico}
          onChange={(e) => alElegirNombre(e.target.value)}
        >
          <option value="">— elija uno —</option>
          {nombres.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <p className="cargar-consecuencia">
        Esta pregunta no se contesta sola nunca. El sistema no sabe cuál de sus puntos es este: eso
        lo dice usted, y solo entonces le recuerda lo que decidió sobre ese nombre.
      </p>
      {nombres.length === 0 && (
        <p className="cargar-hueco">
          No queda ningún nombre libre en el libro de esta línea. Un nombre nunca usado hay que
          anotarlo antes en el repositorio: no se puede estrenar identidad desde aquí.
        </p>
      )}

      {/* En cuanto él elige el nombre, y solo entonces, aparece lo que decidió
          bajo ese nombre. Con la fecha por delante, para que se lea como lo que
          es: memoria suya, no criterio del sistema. */}
      {hayRecuerdo && (
        <p className="cargar-firmado">
          Usted ya contestó esto el {fechaDelRecuerdo(procedencia)}. Lo de abajo es lo que decidió
          ese día, no lo que el sistema cree. Repáselo y, si cambió de opinión, cámbielo: manda lo
          que usted deje hoy.
        </p>
      )}
      {noSePudoPoner.map((x) => (
        <p key={x.rotulo} className="cargar-hueco">
          <b>{x.rotulo}:</b> {x.porQue}
        </p>
      ))}

      {/* Pregunta 2 — qué es, con la consecuencia debajo de cada opción */}
      <label className="cargar-pregunta">
        <span className="cargar-rotulo">{PREGUNTAS.tipo}</span>
        <select
          className="rca-select"
          value={ficha.tipoPunto}
          onChange={(e) => alResponder({ tipoPunto: e.target.value })}
        >
          <option value="">— elija uno —</option>
          {TipoPunto.options.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      <SelloRecordado sello={vivos.tipoPunto} alCambiar={() => alCambiar('tipoPunto')} />
      {avisoDe('tipoPunto') && <p className="cargar-cambio">{avisoDe('tipoPunto')}</p>}
      {ficha.tipoPunto && (
        <p className="cargar-consecuencia">{CONSECUENCIA_TIPO[ficha.tipoPunto]}</p>
      )}

      {/* Pregunta 3 — dónde va. Dato crudo y solo dato crudo. */}
      <label className="cargar-pregunta">
        <span className="cargar-rotulo">{PREGUNTAS.sitio}</span>
        <select
          className="rca-select"
          value={ficha.sitio}
          onChange={(e) => alResponder({ sitio: e.target.value })}
        >
          <option value="">— elija uno —</option>
          {sitios.map((s) => (
            <option key={s.valor} value={s.valor}>
              {/* Los dos extremos solo tienen UN vecino, y por eso se leen
                  distinto. Al final no hay «siguiente»; al principio no hay
                  «anterior». Imprimir «a — de él» en el extremo que no tiene
                  vecino se lee como un dato que falta, no como un extremo. */}
              {s.rotulo} — a{' '}
              {s.valor === AL_PRINCIPIO
                ? `${textoDistancia(s.distanciaAdelante_m)} de él`
                : s.valor === AL_FINAL
                  ? textoDistancia(s.distanciaAtras_m)
                  : `${textoDistancia(s.distanciaAtras_m)} de él y a ${textoDistancia(s.distanciaAdelante_m)} del siguiente`}
            </option>
          ))}
        </select>
      </label>
      <SelloRecordado sello={vivos.sitio} alCambiar={() => alCambiar('sitio')} />
      {avisoDe('sitio') && <p className="cargar-cambio">{avisoDe('sitio')}</p>}
      <p className="cargar-consecuencia">
        Las distancias son las que hay del punto del GPS a cada vecino, sin interpretar, y salen en
        el recorrido de la línea — nunca clasificadas por cercanía. El aparato declara
        ±{nf(PRECISION_DECLARADA_M)} m: <b>la distancia sola no decide de qué lado del vano cae</b>.
        Lo elige usted.
      </p>

      {/* Pregunta 4 — el papel estructural, del molde de los datos */}
      <label className="cargar-pregunta">
        <span className="cargar-rotulo">{PREGUNTAS.funcion}</span>
        <select
          className="rca-select"
          value={ficha.funcionEstructural}
          onChange={(e) => alResponder({ funcionEstructural: e.target.value })}
        >
          <option value="">— elija uno —</option>
          {FuncionEstructural.options.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </label>
      <SelloRecordado sello={vivos.funcionEstructural} alCambiar={() => alCambiar('funcionEstructural')} />
      {avisoDe('funcionEstructural') && <p className="cargar-cambio">{avisoDe('funcionEstructural')}</p>}
      {ficha.funcionEstructural && (
        <p className="cargar-consecuencia">{consecuenciaDeFuncion(ficha.funcionEstructural)}</p>
      )}
      <label className="rca-ev">
        <input
          type="checkbox"
          checked={ficha.funcionConfirmada}
          onChange={(e) => alResponder({ funcionConfirmada: e.target.checked })}
        />
        <span>
          Lo confirmo yo, hoy. Si no lo marca, el papel queda como <b>SUPUESTO</b> y la ficha del
          punto lo dirá — poner su firma sobre lo que no firmó es peor que no tener el dato.
        </span>
      </label>
      <SelloRecordado sello={vivos.funcionConfirmada} alCambiar={() => alCambiar('funcionConfirmada')} />
      {avisoDe('funcionConfirmada') && <p className="cargar-cambio">{avisoDe('funcionConfirmada')}</p>}

      {/* Pregunta 5 — la aprobación. Empieza VACÍA, SIEMPRE, y aunque en el
          libro conste que él ya la aprobó: aprobar es el acto irreversible, y un
          acto no se hereda de un recuerdo. Es la única de las cinco que no se
          recuerda jamás, y la pantalla dice por qué justo debajo. */}
      <label className="rca-ev">
        <input
          type="checkbox"
          checked={ficha.aprobado}
          onChange={(e) => alResponder({ aprobado: e.target.checked })}
        />
        <span><b>{PREGUNTAS.aprueba}</b> Solo se carga lo que usted marca aquí.</span>
      </label>
      <p className="cargar-consecuencia">{avisoAprobacion}</p>

      {!ficha.aprobado && (
        <label className="cargar-pregunta">
          <span className="cargar-rotulo">Si lo deja pendiente, ¿por qué? (queda escrito en el acta)</span>
          <input
            type="text"
            className="rca-select"
            value={ficha.motivoPendiente}
            placeholder="p. ej.: pendiente de verificar en campo"
            onChange={(e) => alResponder({ motivoPendiente: e.target.value })}
          />
        </label>
      )}

      {ficha.aprobado && (
        <label className="cargar-pregunta">
          <span className="cargar-rotulo">
            ¿Por qué decidió así? Esto no cabe en el molde de los datos: solo vive en el acta
          </span>
          <textarea
            className="rca-motivo"
            rows={2}
            value={ficha.porQue}
            placeholder="p. ej.: es el pórtico de llegada, por eso Terminal; el empalme se ve desde el vano siguiente"
            onChange={(e) => alResponder({ porQue: e.target.value })}
          />
        </label>
      )}

      {ficha.aprobado && faltan.length > 0 && (
        <p className="cargar-falta">Falta contestar: {faltan.join(' · ')}.</p>
      )}
      {ficha.aprobado && faltan.length === 0 && (
        <p className="fine">
          Listo para cargar: <b>{ficha.nombreCanonico}</b> · {ficha.tipoPunto} ·{' '}
          {ficha.funcionEstructural}
          {ficha.funcionConfirmada ? ' (confirmado por usted)' : ' (SUPUESTO)'} ·{' '}
          {rotuloDelSitio(sitios, ficha.sitio)}.
        </p>
      )}
    </div>
  );
}
