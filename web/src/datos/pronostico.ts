// ============================================================================
// datos/pronostico.ts — la consulta del tiempo que VIENE, desde el navegador
// ----------------------------------------------------------------------------
// DÓNDE CORRE, Y POR QUÉ AQUÍ. En el navegador, exactamente por lo mismo que
// `datos/clima.ts`: este proyecto no tiene cómputo servidor que no facture
// (ADR-001 descartó Cloud Functions por eso), y el servicio responde con
// `Access-Control-Allow-Origin: *`. Cero infraestructura nueva, cero gasto.
//
// LA FUENTE Y SU LICENCIA (verificado el 2026-08-19 en sus propios términos):
// MET Norway — `api.met.no/weatherapi/locationforecast/2.0`. Datos bajo
// **CC BY 4.0**, que permite el uso comercial con atribución. **No pide cuenta
// ni clave.** Sus condiciones piden identificarse con `User-Agent` y admiten
// `Origin`/`Referer` cuando eso no es posible — desde un navegador no lo es, y
// el `Origin` va solo. Admiten explícitamente el uso desde JavaScript en sitios
// de poco tráfico, que es exactamente esto: una persona, unas pocas consultas.
//
// ⚠️ LA PETICIÓN TIENE QUE SER «SIMPLE». Sus condiciones dicen con esas palabras
// que NO admiten preflight de CORS. Así que aquí no se manda ni una cabecera
// propia —ni `Accept`, ni `If-Modified-Since`— por muy correcto que pareciera:
// cualquiera de ellas convertiría esto en una petición que su servidor rechaza.
// El almacenamiento en caché se respeta por la vía del propio navegador, que
// honra el `Expires` que ellos publican.
//
// ⚠️ ESTO NO SE GUARDA JAMÁS. Un pronóstico no es un hecho fechado: es un modelo
// diciendo qué cree. `datos/clima.ts` guarda sondeos porque son mediciones y las
// reglas los hacen inmutables; guardar un pronóstico haría que dentro de un año
// alguien lo leyera como si alguien hubiera medido algo. Se pide, se mira y se
// olvida al cerrar la pestaña.
//
// ⚠️ NO SE PREGUNTA POR LA LÍNEA. La coordenada se redondea a una rejilla antes
// de salir (`vistas/pronostico.ts · puntoDeConsulta`), con la misma doctrina que
// `nucleo/clima.js · cajaConsulta`: el registro de consultas de un tercero no
// tiene por qué saber dónde está una torre de un cliente. A la resolución del
// modelo —celdas de kilómetros— redondear no cuesta ni un grado de precisión.
// ============================================================================
import { leerPronostico, puntoDeConsulta, type PronosticoEnPantalla } from '../vistas/pronostico';

const BASE = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';

/** Lo que hay que enseñar al pie de la capa. Es un deber de la licencia, no un adorno. */
export const ATRIBUCION_PRONOSTICO = 'Pronóstico: MET Norway (CC BY 4.0)';

/**
 * Lo pedido en esta sesión, por celda. Dos aperturas de la capa en cinco minutos
 * no son dos consultas a un tercero.
 *
 * Se guarda la PROMESA y no el resultado: si él enciende y apaga la capa
 * mientras la primera consulta va por el aire, la segunda se engancha a la misma
 * en vez de disparar otra.
 */
const enCurso = new Map<string, Promise<PronosticoEnPantalla>>();

export class SinPronostico extends Error {}

/**
 * El pronóstico para la celda donde está la línea.
 *
 * @param lat  latitud de referencia de la línea (se REDONDEA antes de salir)
 * @param lon  longitud de referencia
 * @throws {SinPronostico} si no hay red o el servicio no responde. Quien llama
 *         lo dice y sigue: una capa opcional jamás veta a una esencial
 *         (`31 · L-11`).
 */
export async function pedirPronostico(lat: number, lon: number): Promise<PronosticoEnPantalla> {
  const punto = puntoDeConsulta(lat, lon);
  const clave = `${punto.lat},${punto.lon}`;
  const yaVa = enCurso.get(clave);
  if (yaVa) return yaVa;

  const promesa = (async () => {
    let r: Response;
    try {
      // Sin cabeceras propias: ver la advertencia de la cabecera de este archivo.
      r = await fetch(`${BASE}?lat=${punto.lat}&lon=${punto.lon}`);
    } catch {
      throw new SinPronostico('No se pudo contactar con el servicio del tiempo. '
        + '¿Hay conexión? El resto del mapa sigue funcionando sin esto.');
    }
    if (!r.ok) {
      throw new SinPronostico(`El servicio del tiempo respondió ${r.status}. `
        + 'No se inventa un pronóstico: la capa se queda apagada.');
    }
    const leido = leerPronostico(await r.json());
    if (!leido.instantes.length) {
      throw new SinPronostico('El servicio contestó, pero sin un solo instante de pronóstico.');
    }
    return leido;
  })();

  // Un fallo NO queda cacheado: volver a encender la capa debe poder reintentar.
  promesa.catch(() => { enCurso.delete(clave); });
  enCurso.set(clave, promesa);
  return promesa;
}

/** La celda por la que se preguntó. La pantalla la enseña: preguntar dónde no es un detalle. */
export const celdaDeConsulta = puntoDeConsulta;
