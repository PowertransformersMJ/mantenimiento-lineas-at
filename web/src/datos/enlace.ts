// ============================================================================
// datos/enlace.ts — el ÚNICO puente entre los datos y las pantallas
// ----------------------------------------------------------------------------
// REGLA DE ADR-005: hay UNA sola forma de conectar la pantalla a los datos, y
// es ésta. Ningún componente se suscribe a Firestore por su cuenta, ninguno
// guarda una segunda copia del estado, y no hay una segunda capa de caché.
//
// Por qué `useSyncExternalStore` y no un estado de React: porque la verdad NO
// vive en React. Vive en la capa de datos, que es un módulo puro que no importa
// React y que sobrevive intacto si mañana cambiamos de framework. React solo
// se entera de que algo cambió y repinta.
//
// ⚠️ PROHIBIDO por ADR-005: el "estado optimista" de React para la cola de
// envíos. Esa herramienta está pensada para esperas de segundos contra un
// servidor; aquí la confirmación puede tardar DÍAS, y cualquier dato pendiente
// que solo viva en la memoria del framework DESAPARECE cuando el teléfono mata
// la pestaña — sin avisar, con el técnico en mitad de una inspección.
// ============================================================================
import { useSyncExternalStore } from 'react';
import type { AccionCapa, AnalisisCausa, Evidencia, Linea, SondeoClima } from '@lineas/contratos';
import { cargarFirebase } from './cargar';
import { puertaDeAcceso } from '@lineas/contratos';
import { repositorio, usarRepositorio, type AcuseDeFicha, type AcuseDeLote, type EstadoDatos, type EstadoRca, type EstadoSesion, type ResultadoCarga } from './repositorio';
import { leerRuta } from './ruta';
import { repositorioFirestore } from './firestore';

/**
 * Cambia el repositorio provisional por el real la primera vez que hace falta.
 * Va por importación diferida a propósito: el SDK de Firebase pesa 725 kB y no
 * debe descargarse solo por abrir la página.
 */
let conectado = false;
function conectarBase(): void {
  if (conectado) return;
  usarRepositorio(repositorioFirestore);
  conectado = true;
}

type Oyente = () => void;

/** Escribe la dirección sin ensuciar el historial cuando no cambia nada. */
function irA(hash: string, reemplazar = false): void {
  if (location.hash === hash) return;
  if (reemplazar) history.replaceState(null, '', hash);
  else history.pushState(null, '', hash);
}

/**
 * Almacén mínimo, fuera de React. Guarda el estado actual y avisa a quien
 * escuche. Es deliberadamente aburrido: cuanto menos haga, menos hay que
 * entender dentro de 18 meses.
 */
class Almacen {
  #estado: EstadoDatos = { fase: 'cargando' };
  /**
   * El segmento RCA vive AL LADO del estado de la línea, no dentro. Si lo
   * reemplazara, salir del análisis obligaría a recargar la línea desde la base.
   * Sigue habiendo un solo almacén y un solo puente (ADR-005).
   */
  #rca: EstadoRca = { fase: 'cerrado' };
  /** La dirección de la línea desde la que se abrió el RCA, para volver al sitio exacto. */
  #hashPrevio: string | null = null;
  /**
   * QUIÉN entró y con qué permiso. Vive AQUÍ, en el único puente, y no en un
   * gancho suelto de cada pantalla: dos pantallas preguntando por su cuenta son
   * dos respuestas que pueden discrepar, y ésta decide si una pestaña que
   * escribe en la base se enseña o no.
   *
   * Arranca en «comprobando» a propósito: mientras no se sepa, no se afirma que
   * no hay permiso — se dice que todavía no consta.
   */
  #sesion: EstadoSesion = { fase: 'comprobando' };
  #oyentes = new Set<Oyente>();

  leer = (): EstadoDatos => this.#estado;

  suscribir = (o: Oyente): (() => void) => {
    this.#oyentes.add(o);
    return () => this.#oyentes.delete(o);
  };

  poner(e: EstadoDatos): void {
    this.#estado = e;
    this.#avisar();
  }

  #avisar(): void { for (const o of this.#oyentes) o(); }

  leerSesion = (): EstadoSesion => this.#sesion;

  #ponerSesion(s: EstadoSesion): void { this.#sesion = s; this.#avisar(); }

  // ── El segmento RCA ───────────────────────────────────────────────────────

  leerRca = (): EstadoRca => this.#rca;

  #ponerRca(e: EstadoRca): void { this.#rca = e; this.#avisar(); }

  /** Abre el segmento y trae el índice. El estado de la línea NO se toca. */
  async abrirRca(): Promise<void> {
    if (this.#rca.fase === 'cerrado') this.#hashPrevio = location.hash || null;
    irA('#/rca');
    this.#ponerRca({ fase: 'cargando' });
    try {
      conectarBase();
      this.#ponerRca({ fase: 'indice', analisis: await repositorio.listarAnalisis() });
    } catch (e) {
      this.#ponerRca({ fase: 'error', mensaje: e instanceof Error ? e.message : 'no se pudo leer los análisis' });
    }
  }

  /**
   * Deja un análisis en pantalla CON sus evidencias.
   *
   * Un solo sitio hace esto, y no por elegancia: hay tres caminos que abren un
   * análisis —verlo desde el índice, crearlo desde un evento, y refrescarlo tras
   * guardar— y si cada uno trajera las evidencias por su cuenta, bastaría
   * olvidarse en uno para que la pantalla enseñara un análisis sin nada que
   * enlazar y nadie entendiera por qué.
   */
  async #abrirAnalisis(a: AnalisisCausa, indice: AnalisisCausa[]): Promise<void> {
    // La dirección nombra el análisis por su CÓDIGO, no por su identificador
    // interno: un enlace que un ingeniero pega en un chat tiene que decir de qué
    // expediente habla («RCA-2026-08-04-0227»), no un UUID sin significado.
    if (a.codigo) irA(`#/rca/${encodeURIComponent(a.codigo)}`);
    let evidencias: Evidencia[] = [];
    try {
      evidencias = await repositorio.evidenciasDeAnalisis(a.id, a.alcance.investigacionIds);
    } catch {
      // Sin evidencias el análisis SIGUE abriéndose: enlazarlas es una parte, no
      // la condición para poder trabajar. Una capa opcional nunca tiene veto
      // sobre una esencial (`31 · L-11`).
    }

    // Las acciones viven en su propia colección, así que son otra lectura — y va
    // en su propio `try` por lo mismo: que las acciones no se puedan leer no
    // puede impedir ver el razonamiento.
    let acciones: AccionCapa[] = [];
    try {
      acciones = await repositorio.listarAcciones(a.id);
    } catch { /* el análisis se abre igual */ }

    let sondeos: SondeoClima[] = [];
    try {
      sondeos = await repositorio.listarSondeos(a.id);
    } catch { /* el análisis se abre igual */ }

    this.#ponerRca({ fase: 'abierto', analisis: a, indice, evidencias, acciones, sondeos });
  }

  /**
   * Da de alta una acción CAPA y refresca la pantalla.
   *
   * Se releen las acciones desde la base en vez de añadir la nueva a la lista en
   * memoria: si la escritura no llegó, la pantalla tiene que enseñar lo que hay,
   * no lo que se pidió. Es la misma regla que se sigue al crear un análisis.
   */
  async crearAccion(clase: 'correctiva' | 'preventiva', que: string): Promise<void> {
    const r = this.#rca;
    if (r.fase !== 'abierto') return;
    try {
      await repositorio.crearAccion(r.analisis.id, { clase, que });
      this.#ponerRca({ ...r, falloAlGuardar: undefined, acciones: await repositorio.listarAcciones(r.analisis.id) });
    } catch (e) {
      this.#ponerRca({ ...r, falloAlGuardar: { mensaje: e instanceof Error ? e.message : 'fallo desconocido', queSeIntentaba: 'crear la acción' } });
    }
  }

  /** Guarda un cambio de una acción y refresca la lista. */
  async guardarAccion(accionId: string, parche: Record<string, unknown>): Promise<void> {
    const r = this.#rca;
    if (r.fase !== 'abierto') return;
    const previa = r.acciones.find((x) => x.id === accionId);
    try {
      await repositorio.guardarAccion(accionId, parche, previa?.revision ?? 0);
      this.#ponerRca({ ...r, falloAlGuardar: undefined, acciones: await repositorio.listarAcciones(r.analisis.id) });
    } catch (e) {
      this.#ponerRca({ ...r, falloAlGuardar: { mensaje: e instanceof Error ? e.message : 'fallo desconocido', queSeIntentaba: 'guardar la acción' } });
    }
  }

  /**
   * Congela un sondeo de clima en el expediente y refresca la lista.
   *
   * Es una escritura ÚNICA: no se puede corregir después, ni por el
   * administrador. Por eso guardar es un acto DELIBERADO y no un efecto de
   * haber consultado — consultar es mirar; guardar es dejar constancia.
   */
  async guardarSondeo(sondeo: Record<string, unknown>): Promise<void> {
    const r = this.#rca;
    if (r.fase !== 'abierto') return;
    try {
      await repositorio.guardarSondeo(r.analisis.id, sondeo);
      this.#ponerRca({ ...r, falloAlGuardar: undefined, sondeos: await repositorio.listarSondeos(r.analisis.id) });
    } catch (e) {
      this.#ponerRca({ ...r, falloAlGuardar: { mensaje: e instanceof Error ? e.message : 'fallo desconocido', queSeIntentaba: 'congelar el sondeo de clima' } });
    }
  }

  /** Abre un análisis del índice. El documento ya está en memoria; sus fotos no. */
  async verAnalisis(id: string): Promise<void> {
    const r = this.#rca;
    const indice = r.fase === 'indice' ? r.analisis : r.fase === 'abierto' ? r.indice : [];
    const a = indice.find((x) => x.id === id);
    if (a) await this.#abrirAnalisis(a, indice);
  }

  /**
   * Abre un análisis por su CÓDIGO, que es lo que viaja en el enlace.
   *
   * Si el código no existe —expediente borrado, enlace viejo, error al teclear—
   * NO se falla en silencio ni se abre otro: se deja el índice y se dice qué
   * pasó. Abrir «uno parecido» sería lo peor posible en un expediente que se
   * firma.
   */
  async abrirAnalisisPorCodigo(codigo: string): Promise<void> {
    this.#ponerRca({ fase: 'cargando' });
    try {
      conectarBase();
      const indice = await repositorio.listarAnalisis();
      const a = indice.find((x) => x.codigo === codigo);
      if (a) await this.#abrirAnalisis(a, indice);
      else {
        // La dirección tiene que quedar coherente con lo que se ve. Sin esto la
        // vista de línea —que se monta antes— deja su hash puesto, y recargar
        // llevaría a la línea perdiendo el aviso: el enlace roto se volvería
        // invisible en el segundo intento.
        irA('#/rca', true);
        this.#ponerRca({ fase: 'indice', analisis: indice, avisoRuta: `No existe ningún análisis con el código ${codigo}. Puede que se haya borrado o que el enlace esté mal.` });
      }
    } catch (e) {
      this.#ponerRca({ fase: 'error', mensaje: e instanceof Error ? e.message : 'no se pudo abrir el análisis' });
    }
  }

  /** Vuelve al índice del segmento. */
  volverAlIndice(): void {
    const r = this.#rca;
    if (r.fase !== 'abierto') return;
    irA('#/rca');
    this.#ponerRca({ fase: 'indice', analisis: r.indice });
  }

  /**
   * Aplica la dirección actual al estado. La usa el botón Atrás/Adelante.
   *
   * Es IDEMPOTENTE a propósito: si el estado ya coincide con la dirección no
   * hace nada. Sin eso, cada transición escribiría la dirección, la dirección
   * dispararía la sincronización y volvería a transicionar — un bucle.
   */
  async sincronizarConRuta(): Promise<void> {
    const ruta = leerRuta();
    const r = this.#rca;

    if (ruta?.tipo === 'rca') {
      if (ruta.codigo) {
        if (r.fase === 'abierto' && r.analisis.codigo === ruta.codigo) return;
        await this.abrirAnalisisPorCodigo(ruta.codigo);
      } else {
        if (r.fase === 'indice') return;
        await this.abrirRca();
      }
      return;
    }

    // La dirección ya no habla del segmento: si estaba abierto, se cierra.
    if (r.fase !== 'cerrado') this.#ponerRca({ fase: 'cerrado' });
  }

  /** Cierra el segmento y devuelve la pantalla a la línea, sin recargarla. */
  cerrarRca(): void {
    // Devuelve a la línea Y a la pestaña de la que se vino. Sin esto, cerrar el
    // segmento dejaba la dirección en `#/rca` y recargar volvía a abrirlo.
    irA(this.#hashPrevio ?? '#/');
    this.#hashPrevio = null;
    this.#ponerRca({ fase: 'cerrado' });
  }

  /**
   * Abre un análisis desde un evento de falla y lo deja en pantalla.
   * Se relee el índice después de crear: así la lista y lo abierto no pueden
   * discrepar, que es como se acaba enseñando algo que ya no existe.
   */
  async crearRcaDesdeEvento(datos: { titulo: string; lineaId?: string; apoyoId?: string; investigacionId?: string }): Promise<void> {
    this.#ponerRca({ fase: 'cargando' });
    try {
      conectarBase();
      const id = await repositorio.crearAnalisis(datos);
      const indice = await repositorio.listarAnalisis();
      const a = indice.find((x) => x.id === id);
      if (a) await this.#abrirAnalisis(a, indice);   // reabrir limpia el aviso: ya no hay fallo
      else this.#ponerRca({ fase: 'indice', analisis: indice });
    } catch (e) {
      this.#ponerRca({ fase: 'error', mensaje: e instanceof Error ? e.message : 'no se pudo abrir el análisis' });
    }
  }

  /** Guarda una parte del análisis y refresca lo que hay en pantalla. */
  async guardarParte(parche: Record<string, unknown>): Promise<void> {
    const r = this.#rca;
    if (r.fase !== 'abierto') return;
    const previo = r.analisis;
    try {
      await repositorio.guardarParte(previo.id, parche, previo.revision ?? 0);
      const indice = await repositorio.listarAnalisis();
      const a = indice.find((x) => x.id === previo.id);
      if (a) await this.#abrirAnalisis(a, indice);   // reabrir limpia el aviso: ya no hay fallo
    } catch (e) {
      this.#ponerRca({ ...r, falloAlGuardar: { mensaje: e instanceof Error ? e.message : 'fallo desconocido', queSeIntentaba: 'guardar los cambios del análisis' } });
    }
  }

  /**
   * Crea puntos nuevos de la línea que está abierta y **relee la línea entera**
   * desde la base.
   *
   * La relectura no es cortesía: es lo que impide el peor final de esta
   * pantalla. Sin ella, quien acaba de cargar dos puntos vería la línea exacta
   * que tenía antes —26 puntos— y lo natural sería volver a pulsar el botón. Y
   * un apoyo no se puede borrar.
   *
   * Se relee AUNQUE la escritura haya ido a medias: si de tres puntos entraron
   * dos, lo que hay en la base son 28, y es eso lo que tiene que verse.
   *
   * Lo que falla LANZA hacia la pantalla, a diferencia del resto de escrituras
   * de este archivo, que dejan el aviso en el estado. Aquí quien llama necesita
   * el motivo entero para el acuse y para el acta: un acto sin deshacer no se
   * puede resumir en «no se pudo».
   */
  async cargarPuntos(documentos: Record<string, unknown>[]): Promise<ResultadoCarga> {
    conectarBase();
    const e = this.#estado;
    // Los apoyos que la aplicación YA tiene: son con los que se calculó el
    // antes/después que el Ingeniero acaba de aprobar. Van a la escritura para
    // saber si algún punto estaba ya cargado SIN preguntárselo a la base — esa
    // pregunta, sobre un documento que aún no existe, la deniegan las reglas.
    const yaCargados = e.fase === 'listo' ? e.apoyos.map((a) => a.id) : [];
    return await repositorio.cargarPuntosNuevos(documentos, yaCargados);
  }

  /**
   * Escribe la FICHA ESTRUCTURAL de UN apoyo y **no recarga la línea**.
   *
   * La ausencia de recarga es deliberada y es la misma lección que dejó escrita
   * `refrescarLinea` unas líneas más abajo: `abrir()` pone la aplicación en fase
   * «cargando», y en esa fase `App.tsx` sustituye la pantalla entera de la
   * línea. Recargar aquí destruiría el acuse —qué se escribió, en qué apoyo, con
   * qué origen y qué veredictos se movieron— en el mismo instante en que se
   * genera. La línea se relee cuando él ya lo ha leído y pulsa el botón.
   *
   * Lo que falla LANZA hacia la pantalla, igual que `cargarPuntos` y por el
   * mismo motivo: quien llama necesita el motivo ENTERO. Un conflicto de
   * revisión resumido en «no se pudo guardar» pierde justo la parte que dice
   * qué hacer a continuación.
   */
  async guardarFicha(
    apoyoId: string,
    ficha: Record<string, unknown>,
    revision: number,
  ): Promise<AcuseDeFicha> {
    conectarBase();
    return await repositorio.guardarFichaApoyo(apoyoId, ficha, revision);
  }

  /**
   * Declara si el vano que SALE de un apoyo lleva cable de guarda.
   *
   * ⚠️ ÉSTE SÍ RECARGA LA LÍNEA, al revés que sus dos vecinos de arriba. No es
   * una incoherencia: aquéllos devuelven un ACUSE que es el único papel que
   * queda de la operación y recargar lo borraría. Aquí no hay papel que perder —
   * lo que hay es un mapa que deriva los tramos dañados de los propios apoyos,
   * así que sin recargar la marca quedaría en la base y NO en la pantalla. Y una
   * marca que no se ve se lee como una marca que no se guardó.
   */
  async declararCableGuarda(
    apoyoId: string,
    valor: 'presente' | 'ausente' | null,
    revision: number,
  ) {
    conectarBase();
    const acuse = await repositorio.declararCableGuarda(apoyoId, valor, revision);
    await almacen.cargar();
    return acuse;
  }

  /**
   * Escribe el MISMO dato de catálogo en VARIOS apoyos, y **tampoco recarga la
   * línea**, por el mismo motivo que su hermana de arriba: el acuse de un lote
   * —a quién se le escribió, a quién no y por qué— es el único papel que queda
   * de la operación, y `abrir()` lo borraría en el instante en que se genera.
   *
   * Aquí no se decide nada: quién puede recibir el dato lo dictan la escritura
   * (que es la salvaguarda de verdad, con permiso de administración, solo
   * estructuras, solo huecos y atómica) y `vistas/fichaLote.ts`, que la espeja
   * para poder decirlo ANTES. Este método solo lleva y trae.
   *
   * Lo que falla LANZA hacia la pantalla con el motivo ENTERO: un conflicto de
   * revisión trae el nombre del apoyo que otra persona tocó, y resumirlo en «no
   * se pudo guardar» quitaría justo la parte que dice qué hacer.
   */
  async guardarFichaEnLote(
    apoyoIds: string[],
    ficha: Record<string, unknown>,
    revisiones: Record<string, number>,
  ): Promise<AcuseDeLote> {
    conectarBase();
    return await repositorio.guardarFichaApoyoEnLote(apoyoIds, ficha, revisiones);
  }

  /**
   * Relee la línea DESPUÉS de una carga, y solo cuando el Ingeniero lo pide.
   *
   * Antes esto se hacía solo, en un `finally`, y era peor que no hacerlo:
   * `abrir()` pone la aplicación en fase «cargando», y en esa fase `App.tsx`
   * sustituye la pantalla entera de la línea. Eso destruía la pestaña Cargar en
   * el mismo instante en que terminaba de escribir — y con ella el acuse de qué
   * entró, qué quedó fuera y por qué, y el botón del acta. Sobre unos apoyos que
   * NO se pueden borrar ni corregir, el Ingeniero se quedaba sin ningún papel
   * que demostrara lo que acababa de hacer. Ahora el acuse manda: la línea se
   * refresca cuando él ya lo ha leído y lo pide.
   */
  async refrescarLinea(): Promise<void> {
    const e = this.#estado;
    if (e.fase === 'listo') await this.abrir(e.linea.id, e.lineas);
  }

  /** Carga la línea que el usuario tenga permiso de ver. Nunca inventa nada. */
  async cargar(): Promise<void> {
    this.poner({ fase: 'cargando' });
    try {
      conectarBase();
      // Si venimos de vuelta de Google por redirección, hay que recoger el
      // resultado ANTES de preguntar por la sesión.
      const { recogerRedireccion } = await cargarFirebase();
      await recogerRedireccion();
      const s = await repositorio.sesion();
      // Se guarda SIEMPRE, también cuando no hay sesión: «no hay sesión» es una
      // respuesta, y una pantalla que no la reciba se quedaría comprobando para
      // siempre.
      this.#ponerSesion(s);
      if (s.fase !== 'autenticado') return this.poner({ fase: 'sin_sesion' });

      // LA PUERTA, y va AQUÍ a propósito: después de comprobar la sesión y
      // ANTES de pedir un solo dato de línea. No es una ruta ni una ventana
      // emergente — es una fase de este mismo almacén, así que no hay «detrás»
      // al que saltar: los datos no se llegan a pedir.
      //
      // `puertaDeAcceso` no lanza nunca y ante la duda deja pasar. Esta pantalla
      // es HIGIENE, no la frontera de seguridad; la frontera son las reglas de
      // la base. Una capa opcional jamás tiene veto sobre una esencial.
      const { esperarSesion, reclamosDeSesion } = await cargarFirebase();
      const u = await esperarSesion();
      if (u) {
        const { proveedor, claims } = await reclamosDeSesion(u);
        const recibo = await repositorio.reciboContrasena();
        if (puertaDeAcceso({ proveedor, claims, recibo }).fase === 'cambiar_contrasena') {
          return this.poner({ fase: 'cambiar_contrasena', correo: u.email ?? '' });
        }
      }

      const lineas = await repositorio.listarLineas();
      if (!lineas.length) return this.poner({ fase: 'vacio' });

      // LA DIRECCIÓN MANDA. Antes se abría siempre `lineas[0]` y el código que
      // venía en la dirección se descartaba: con dos líneas, dos ingenieros
      // podían discutir cifras creyendo que miraban la misma.
      const ruta = leerRuta();
      let aviso: string | undefined;
      let objetivo = lineas[0];

      if (ruta?.tipo === 'linea') {
        const pedida = lineas.find((l) => l.codigo === ruta.codigo);
        if (pedida) objetivo = pedida;
        else {
          // NUNCA en silencio: si el enlace pedía una línea que este usuario no
          // tiene asignada, se abre otra y se dice cuál y por qué.
          aviso = `El enlace pedía la línea ${ruta.codigo}, que no está entre las tuyas. `
                + `Se abrió ${lineas[0].codigo}.`;
        }
      }

      await this.abrir(objetivo.id, lineas, aviso);

      // El segmento de causa raíz se pinta ENCIMA de la línea, así que la línea
      // se carga primero y el expediente después.
      if (ruta?.tipo === 'rca') {
        if (ruta.codigo) await this.abrirAnalisisPorCodigo(ruta.codigo);
        else await this.abrirRca();
      }
    } catch (e) {
      this.poner({ fase: 'error', mensaje: e instanceof Error ? e.message : 'error desconocido' });
    }
  }

  /**
   * Abre una línea del parque conservando la LISTA. Antes se pedía la lista
   * solo para saber cuál abrir y se tiraba; por eso la pantalla no podía
   * enseñar el parque. La lista viaja con el estado, no se vuelve a pedir.
   */
  async abrir(lineaId: string, lineas?: Linea[], avisoRuta?: string): Promise<void> {
    const previo = this.#estado;
    const conocidas = lineas ?? (previo.fase === 'listo' ? previo.lineas : undefined);
    this.poner({ fase: 'cargando' });
    try {
      conectarBase();
      const e = await repositorio.cargarLinea(lineaId);
      this.poner(e.fase === 'listo' ? { ...e, avisoRuta, lineas: conocidas } : e);
    } catch (e) {
      this.poner({ fase: 'error', mensaje: e instanceof Error ? e.message : 'error desconocido' });
    }
  }
}

export const almacen = new Almacen();

/** El único gancho que las pantallas usan para leer datos. */
export function useDatos(): EstadoDatos {
  return useSyncExternalStore(almacen.suscribir, almacen.leer, almacen.leer);
}

/** El gancho del segmento RCA. Misma suscripción, otro trozo del estado. */
export function useRca(): EstadoRca {
  return useSyncExternalStore(almacen.suscribir, almacen.leerRca, almacen.leerRca);
}

/**
 * Quién entró y con qué permiso. Misma suscripción, otro trozo del estado.
 *
 * ⚠️ Lo que decide esto es COSMÉTICO. Esconder una pestaña no impide nada: quien
 * quisiera podría llamar a la base igual. Quien de verdad decide son las reglas
 * de Firestore, del otro lado. Esto existe para que la persona vea con qué
 * permiso entró antes de trabajar media hora en una carga que la base va a
 * negar.
 */
export function useSesion(): EstadoSesion {
  return useSyncExternalStore(almacen.suscribir, almacen.leerSesion, almacen.leerSesion);
}
