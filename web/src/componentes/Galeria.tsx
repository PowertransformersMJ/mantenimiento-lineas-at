// ============================================================================
// componentes/Galeria.tsx — la evidencia fotográfica del expediente
// ----------------------------------------------------------------------------
// Las fotos son datos de cliente: NO viajan en el paquete publicado ni dentro
// de un documento de la base. Viven en almacenamiento de objetos privado, y
// cada una se pide al portero (`evidencias/`) con el token de la sesión actual.
// El portero verifica la firma del token contra las llaves de Google antes de
// entregar un solo byte.
//
// CONSECUENCIA VISIBLE, y por eso se explica en pantalla: si no hay sesión, o
// si el portero aún no está desplegado, NO hay fotos — y la galería lo dice con
// esas palabras en vez de dejar cuadros rotos.
//
// El objeto de URL se REVOCA al desmontar. Sin eso, entrar y salir de la
// pestaña veinte veces deja veinte imágenes retenidas en memoria: en el móvil
// de una cuadrilla eso es la pestaña muerta a media inspección.
// ============================================================================
import { useEffect, useState } from 'react';
import type { Evidencia } from '@lineas/contratos';

/** Base del portero. Sin ella configurada, la galería no intenta nada. */
const PORTERO = import.meta.env.VITE_EVIDENCIAS_URL as string | undefined;

type Estado =
  | { fase: 'inactivo' }
  | { fase: 'cargando' }
  | { fase: 'listo'; urls: Map<string, string> }
  | { fase: 'error'; mensaje: string };

async function traerFotos(evidencias: Evidencia[]): Promise<Map<string, string>> {
  const { cargarFirebase } = await import('../datos/cargar');
  const { esperarSesion } = await cargarFirebase();
  const u = await esperarSesion();
  if (!u) throw new Error('sin sesión');
  const token = await u.getIdToken();

  const urls = new Map<string, string>();
  for (const e of evidencias) {
    const r = await fetch(`${PORTERO}/e/${encodeURIComponent(e.rutaObjeto)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) {
      const detalle = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
      throw new Error(detalle.error ?? `HTTP ${r.status}`);
    }
    urls.set(e.id, URL.createObjectURL(await r.blob()));
  }
  return urls;
}

/**
 * De qué son las fotos que muestra esta galería.
 *
 * ADITIVO a propósito: los valores por defecto son los textos que la pestaña
 * Falla ya enseña bien, así que quien no pase nada no ve ningún cambio. Existe
 * porque en la ficha de un apoyo la redacción del expediente es FALSA — un pie
 * que dice «del evento» bajo la foto de una estructura sana afirma que hubo un
 * evento ahí, y eso acaba dentro de un informe firmable (plan de TODO-43).
 */
export interface RotulosGaleria {
  /** Encabezado de la sección. */
  titulo?: string;
  /** De qué son: «del evento», «de la estructura E06»… Va en la frase de arriba. */
  deQue?: string;
  /** Qué se dice cuando no hay ni una foto. */
  vacio?: string;
  /** Texto alternativo de cada imagen, para lector de pantalla. */
  alt?: string;
}

export function Galeria({ evidencias, rotulos = {}, noSePudoLeer }:
  { evidencias: Evidencia[]; rotulos?: RotulosGaleria; noSePudoLeer?: string }) {
  const titulo = rotulos.titulo ?? 'Evidencia fotográfica';
  const deQue = rotulos.deQue ?? 'del evento';
  const alt = rotulos.alt ?? 'Fotografía del evento';
  const vacio = rotulos.vacio
    ?? 'Este expediente no tiene fotografías cargadas. Las imágenes del evento se suben aparte';
  const [estado, setEstado] = useState<Estado>({ fase: 'inactivo' });
  const [ampliada, setAmpliada] = useState<string | null>(null);

  useEffect(() => {
    if (!PORTERO || evidencias.length === 0) { setEstado({ fase: 'inactivo' }); return; }
    let vivo = true;
    let creadas: Map<string, string> | null = null;
    setEstado({ fase: 'cargando' });
    traerFotos(evidencias)
      .then((urls) => {
        creadas = urls;
        if (vivo) setEstado({ fase: 'listo', urls });
        else urls.forEach((u) => URL.revokeObjectURL(u));   // se desmontó a media carga
      })
      .catch((e) => { if (vivo) setEstado({ fase: 'error', mensaje: e.message }); });

    return () => {
      vivo = false;
      creadas?.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [evidencias]);

  if (evidencias.length === 0) {
    // No es lo mismo «no hay fotos» que «no se pudieron traer». Lo segundo, dicho
    // como lo primero, hace que alguien descarte una familia de causas por falta
    // de evidencia cuando la evidencia existía (`32 · L-44`).
    if (noSePudoLeer) {
      return (
        <section className="panel">
          <h2>{titulo}</h2>
          <p className="alerta">
            <b>No se pudieron leer las fichas de fotografía.</b> Eso NO significa que no haya
            fotos: significa que no se pudo comprobar. No apoyes en esta pantalla ningún
            descarte por «falta de evidencia».
          </p>
          <p className="fine">Motivo técnico: {noSePudoLeer}</p>
        </section>
      );
    }
    return (
      <section className="panel">
        <h2>{titulo}</h2>
        <p className="fine">
          {vacio} (<code>herramientas/subir-evidencias.mjs</code>): no viajan dentro de la
          aplicación ni dentro de la base, porque son material del cliente.
        </p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>{titulo}</h2>
      <p className="fine">
        {evidencias.length} fotografía(s) {deQue}. Cada una se pide con <b>su sesión</b>: el
        almacenamiento es privado y nadie sin autorizar las ve, ni con el enlace.
      </p>

      {!PORTERO && (
        <p className="alerta">
          El servicio que entrega las fotos todavía no está configurado en esta versión publicada.
          Las fichas de las {evidencias.length} imágenes sí están: falta desplegar el portero.
        </p>
      )}
      {estado.fase === 'cargando' && <p className="fine">Descargando fotografías…</p>}
      {estado.fase === 'error' && (
        <p className="alerta">No se pudieron traer las fotografías: {estado.mensaje}.</p>
      )}

      <div className="galeria">
        {evidencias.map((e) => {
          const url = estado.fase === 'listo' ? estado.urls.get(e.id) : undefined;
          return (
            <figure key={e.id} className="galeria-item">
              {url ? (
                <button type="button" className="galeria-lupa" onClick={() => setAmpliada(url)}
                  aria-label={`Ampliar: ${e.pie ?? alt.toLowerCase()}`}>
                  {/* ⚠️ SIN `loading="lazy"`. Cazado con las fotos reales ya en R2:
                      el navegador NUNCA seleccionaba la fuente de estas imágenes
                      —`currentSrc` vacío y `complete: false` aun estando a la vista—
                      y la galería salía en blanco con los pies de foto puestos, que
                      es el fallo más engañoso posible: parece que faltan las fotos
                      cuando en realidad ya estaban descargadas en memoria.
                      El diferido de Chrome no se lleva con las URL `blob:`, y aquí
                      además no aporta nada: cuando este elemento se pinta, el binario
                      YA se bajó del portero (por eso hay un blob). Diferir la pintura
                      de algo que ya está en memoria no ahorra ni una petición. */}
                  <img src={url} alt={e.pie ?? alt} />
                </button>
              ) : (
                <div className="galeria-hueco" aria-hidden="true" />
              )}
              {e.pie && <figcaption>{e.pie}</figcaption>}
            </figure>
          );
        })}
      </div>

      {ampliada && (
        // Cerrar con Escape además del clic: en una tablet en campo, el clic
        // fuera es incómodo y el teclado a veces es lo único que responde.
        <div className="visor" role="dialog" aria-modal="true" aria-label="Fotografía ampliada"
          tabIndex={-1}
          onClick={() => setAmpliada(null)}
          onKeyDown={(ev) => { if (ev.key === 'Escape') setAmpliada(null); }}
          ref={(n) => n?.focus()}>
          <img src={ampliada} alt="Fotografía ampliada del evento" />
          <p className="visor-pie">Pulse en cualquier sitio o Escape para cerrar.</p>
        </div>
      )}
    </section>
  );
}
