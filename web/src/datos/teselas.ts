// ============================================================================
// datos/teselas.ts — el protocolo PMTiles y la descarga de un recorte
// ----------------------------------------------------------------------------
// POR QUÉ VIVE AQUÍ Y NO DENTRO DEL MAPA DE LA LÍNEA. Lo estrenó `Mapa.tsx` y
// ahí se quedó — hasta que el atlas solar necesitó lo mismo para su recorte del
// Caribe. Importarlo del componente habría sido gratis de escribir y caro de
// verdad: `Mapa.tsx` se carga EN DIFERIDO porque MapLibre pesa cerca de un mega
// y el mapa es OPCIONAL, y un `import` estático desde otra pantalla funde los
// dos trozos en uno. MEDIDO al hacerlo sin querer: el paquete de entrada pasó de
// 820 kB a 1.883 kB — la cuadrilla con dos rayas de señal se habría descargado
// MapLibre entero para ver la pantalla de acceso.
//
// Aquí no hay React ni componente: el protocolo, la caché por nombre de archivo
// y la descarga con reintentos. Lo importan los DOS mapas.
// ============================================================================
import * as maplibregl from 'maplibre-gl';
import { FileSource, PMTiles, Protocol } from 'pmtiles';
// ⚠️ EL WORKER VA COMO ASSET PROPIO, no como blob autogenerado. En producción,
// el worker por defecto de MapLibre nació muerto: existía como objeto, recibía
// tareas y jamás respondió una (7 pendientes, 0 respuestas, sin error alguno).
// Resultado: mapa gris eterno. Con el paquete de worker que MapLibre publica,
// servido desde nuestros propios assets, el hilo arranca de verdad.
// `?worker&url`: Vite lo compila como entrada de worker EMPAQUETANDO sus
// dependencias (importa ./maplibre-gl-shared.mjs; con `?url` a secas viajaría
// cojo y moriría igual de mudo).
import urlWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

// ⚠️ Cloudflare Pages NO honra las peticiones de rango en estos archivos
// (verificado: pide 1 KB y responde 200 con los 4,5 MB) — y el lector de
// PMTiles vive de los rangos. La salida es MEJOR que el parche: el recorte pesa
// 4,3 MB, así que se descarga ENTERO una vez, el navegador lo cachea inmutable,
// y las teselas se sirven desde memoria. Es además el mismo patrón que
// necesitará el modo campo sin señal (F4): archivo completo en el dispositivo.
maplibregl.setWorkerUrl(urlWorker);

export interface MetaTeselas {
  p: PMTiles;
  limites: [number, number, number, number];
  zMin: number;
  zMax: number;
}

let protocolo: Protocol | null = null;
/**
 * Un archivo por capa, cacheado por nombre. Las capas nuevas (satelital,
 * térmico) NO se descargan al abrir el mapa: solo cuando él las pide. El mapa
 * base pesa 4,3 MB y la imagen satelital otro tanto largo — cargarlas siempre
 * castigaría con megabytes a quien nunca las va a mirar, y este sistema tiene
 * que poder abrirse desde el campo.
 */
const archivos = new Map<string, Promise<MetaTeselas>>();

export function prepararTeselas(nombre = 'cartagena.pmtiles'): Promise<MetaTeselas> {
  if (!protocolo) {
    protocolo = new Protocol();
    maplibregl.addProtocol('pmtiles', protocolo.tile);
  }
  const yaVa = archivos.get(nombre);
  if (yaVa) return yaVa;

  const archivo = (async () => {
    const esperas = [0, 500, 1500, 3500];
    let ultimo: unknown;
    for (const ms of esperas) {
      if (ms) await new Promise((r) => setTimeout(r, ms));
      try {
        const r = await fetch('/mapas/' + nombre);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const blob = await r.blob();
        const p = new PMTiles(new FileSource(new File([blob], nombre)));
        protocolo!.add(p);          // queda registrado como pmtiles://<nombre>
        // Los metadatos se leen DIRECTO del archivo y se declaran explícitos en
        // la fuente. Así no dependemos de la petición de metadatos vía
        // protocolo, que es justo donde el estilo se quedaba mudo sin error.
        const h = await p.getHeader();
        return {
          p,
          limites: [h.minLon, h.minLat, h.maxLon, h.maxLat] as [number, number, number, number],
          zMin: h.minZoom,
          zMax: h.maxZoom,
        };
      } catch (e) { ultimo = e; }
    }
    throw ultimo instanceof Error ? ultimo : new Error('no se pudo descargar la cartografía');
  })();

  // Un fallo no queda cacheado: reabrir la pestaña debe poder reintentar.
  archivo.catch(() => { archivos.delete(nombre); });
  archivos.set(nombre, archivo);
  return archivo;
}

