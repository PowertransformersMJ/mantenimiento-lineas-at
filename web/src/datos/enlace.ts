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
import { repositorio, usarRepositorio, type EstadoDatos, type EstadoRca } from './repositorio';
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
