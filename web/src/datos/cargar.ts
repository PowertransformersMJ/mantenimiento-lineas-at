// ============================================================================
// datos/cargar.ts — la ÚNICA frontera de carga diferida del sistema
// ----------------------------------------------------------------------------
// El SDK de Firebase pesa unos 750 kB. No debe descargarse solo por abrir la
// página: la cuadrilla no tiene que pagar eso con dos rayas de señal para ver
// una pantalla de acceso.
//
// Pero una carga diferida que falla MATA la aplicación, y eso ya pasó: al
// desplegar, el servidor tardó unos segundos en tener disponible el trozo, el
// navegador falló una vez, y la página se quedó en blanco para siempre.
//
// Por eso hay UNA sola frontera —no dos encadenadas, que multiplican el riesgo—
// y REINTENTA. Una descarga que tropieza no puede dejar al usuario sin sistema.
// ============================================================================

type Modulo = typeof import('./firebase');

let cache: Promise<Modulo> | null = null;

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Reintenta una importación diferida ante fallos de red (0,4 s → 1,2 s → 3 s).
 * Genérica: la usan Firebase y el mapa. Una descarga que tropieza —por señal
 * mala o porque un despliegue aún se está propagando— no puede matar la
 * aplicación.
 */
export async function conReintentos<T>(importar: () => Promise<T>): Promise<T> {
  const esperas = [0, 400, 1200, 3000];
  let ultimo: unknown;
  for (const ms of esperas) {
    if (ms) await esperar(ms);
    try {
      return await importar();
    } catch (e) {
      ultimo = e;
    }
  }
  throw ultimo instanceof Error ? ultimo : new Error('fallo de descarga');
}

/**
 * Trae el módulo de Firebase, reintentando ante fallos de red.
 * Espera 0,4 s, luego 1,2 s, luego 3 s: da tiempo a que un despliegue termine
 * de propagarse sin dejar al usuario mirando una pantalla muerta.
 */
export async function cargarFirebase(): Promise<Modulo> {
  if (cache) return cache;

  cache = (async () => {
    const esperas = [0, 400, 1200, 3000];
    let ultimo: unknown;
    for (const ms of esperas) {
      if (ms) await esperar(ms);
      try {
        return await import('./firebase');
      } catch (e) {
        ultimo = e;
      }
    }
    throw new Error(
      'No se pudo descargar una parte de la aplicación. Suele ser un problema de red pasajero: ' +
      'reintente en unos segundos. (' + (ultimo instanceof Error ? ultimo.message : 'desconocido') + ')',
    );
  })();

  // Un fallo no queda cacheado: el botón de reintentar tiene que poder volver
  // a intentarlo de verdad.
  cache.catch(() => { cache = null; });
  return cache;
}
