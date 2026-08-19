// ============================================================================
// datos/fotos.ts — subir las fotografías desde la aplicación
// ----------------------------------------------------------------------------
// Es la única pieza de esta ola que toca la red. Todo lo que DECIDE —de qué
// apoyo es cada foto, qué entra, qué ya está, qué se para— vive en
// `@lineas/importar/evidencias` y se prueba en Node. Aquí solo se ejecuta lo ya
// decidido, en el orden en que hay que ejecutarlo.
//
// EL ORDEN ES LA DECISIÓN MÁS IMPORTANTE DE ESTE ARCHIVO: primero el OBJETO,
// después la FICHA. Al revés dejaría una ficha apuntando al vacío, que es
// exactamente lo que la galería enseña como error. Un objeto sin ficha no lo ve
// nadie, no duplica nada al repetir la subida y ocupa unos megas dentro de los
// 10 GB gratuitos; una ficha sin objeto rompe una pantalla.
//
// LAS CUATRO REDES CONTRA SUBIR DOS VECES LA MISMA FOTO, y ninguna le pregunta
// a la base por un documento que todavía no existe — que fue el fallo del 17-08
// (§ADR-028): `puedeLeer()` decide mirando `resource.data.orgId`, y en un
// documento inexistente no hay `resource`, así que la base no contesta «no
// está»: DENIEGA.
//
//   1. LA LISTA QUE LA APLICACIÓN YA TIENE. Las fichas de evidencia de la línea
//      ya están cargadas en memoria por una CONSULTA (`where orgId`, `where
//      lineaId`). Una consulta devuelve lo que hay y punto. Coste: cero.
//   2. LA HUELLA SE RECALCULA AQUÍ, del archivo de verdad. El `sha256` que trae
//      el índice de la bóveda sirve para pintar la tabla rápido, pero si alguien
//      reconvirtió una foto y no regeneró el índice, ese hash miente.
//   3. EL PORTERO, del lado del servidor: `head` antes de escribir, y si el
//      objeto está responde «ya estaba» sin escribir.
//   4. LA IDEMPOTENCIA DE LA PROPIA CLAVE: la ruta la calcula EL PORTERO con la
//      huella del contenido —el cliente no la elige, ver `evidencias/src/index.js`—
//      y lleva la huella y el id de
//      la ficha se deriva de la huella. Aunque las tres anteriores fallaran a la
//      vez, la misma foto cae en la MISMA clave y en el MISMO documento.
// ============================================================================
import { huellaDeArchivo, idDeEvidencia } from '@lineas/importar/identidad';
import { repositorio } from './repositorio';
import type { FichaDeFoto, ResultadoFotos } from './repositorio';

/** Base del portero. Sin ella configurada, esta pantalla no intenta nada. */
export const PORTERO = import.meta.env.VITE_EVIDENCIAS_URL as string | undefined;

/** Una foto lista para subir: el archivo del disco y a qué punto va. */
export interface FotoPorSubir {
  archivo: File;
  /** El nombre del archivo tal cual, que es el que va en la clave. */
  nombre: string;
  /** El punto al que va, en el idioma del Ingeniero. */
  punto: string;
  apoyoId: string;
  tomadaEn?: string;
}

/** Lo que pasó con cada foto, para el acuse. */
export interface IntentoDeSubida {
  punto: string;
  archivo: string;
  entro: boolean;
  yaEstaba: boolean;
  motivo?: string;
}

export interface ResultadoSubida {
  intentos: IntentoDeSubida[];
  fuera: { punto: string; archivo: string; motivo: string }[];
  /** Lo que dijo la base al escribir las fichas. */
  fichas: ResultadoFotos | null;
}

const HUMANO: Record<number, string> = {
  401: 'la sesión caducó mientras se subía. Vuelva a entrar y repita: lo que ya entró no se vuelve a subir.',
  403: 'esta sesión no tiene permiso para subir fotografías.',
  411: 'el navegador no declaró el tamaño del archivo.',
  413: 'la fotografía pasa del tope de tamaño por archivo.',
  415: 'el tipo de archivo no cuadra con su nombre.',
  503: 'el servicio que guarda las fotos no está configurado.',
};

/**
 * Sube UN lote. Devuelve qué entró y qué no, sin lanzar por una foto suelta:
 * negarle al Ingeniero las 104 buenas por culpa de las 2 que se cortaron sería
 * castigarle por la red del sitio.
 *
 * `avisar` se llama antes de cada archivo, para que la pantalla pueda decir
 * «Subiendo 37 de 106… (punto E15)».
 */
export async function subirFotos(
  fotos: FotoPorSubir[],
  contexto: { codigoLinea: string; lineaId: string; origen: string; huellasEnLaBase: string[] },
  avisar: (hechas: number, total: number, punto: string) => void,
): Promise<ResultadoSubida> {
  if (!PORTERO) {
    throw new Error(
      'El servicio que guarda las fotografías no está configurado en esta versión publicada. '
      + 'No se ha subido nada y no se ha escrito nada en la base.',
    );
  }

  const { cargarFirebase } = await import('./cargar');
  const { esperarSesion } = await cargarFirebase();
  const u = await esperarSesion();
  if (!u) throw new Error('No hay ninguna sesión abierta: no se puede subir ninguna fotografía.');

  const yaEnLaBase = new Set(contexto.huellasEnLaBase);
  const intentos: IntentoDeSubida[] = [];
  const fuera: ResultadoSubida['fuera'] = [];
  const fichas: FichaDeFoto[] = [];

  for (let i = 0; i < fotos.length; i += 1) {
    const f = fotos[i];
    avisar(i + 1, fotos.length, f.punto);
    try {
      // RED 2: la huella se calcula del archivo REAL, no se cree la del índice.
      const bytes = await f.archivo.arrayBuffer();
      const sha256 = await huellaDeArchivo(bytes);

      // RED 1: contra lo que la aplicación ya tiene en memoria. Sin una lectura más.
      if (yaEnLaBase.has(sha256)) {
        intentos.push({ punto: f.punto, archivo: f.nombre, entro: false, yaEstaba: true });
        continue;
      }

      // ⚠️ AQUÍ NO SE ELIGE DÓNDE SE GUARDA LA FOTO.
      //
      // Antes esta línea construía la clave del objeto y se la mandaba al
      // portero. Ese diseño se retiró: dejaba que el cliente propusiera la ruta,
      // y se demostró que una ruta preparada podía pisar la fotografía de otro
      // apoyo. Ahora la calcula el portero con la huella de lo que recibe, y la
      // devuelve en su respuesta. Lo que va en la dirección son solo tres trozos
      // para que el nombre sea legible; ninguno decide la identidad del objeto.
      const donde = new URLSearchParams({
        linea: contexto.codigoLinea, origen: contexto.origen, archivo: f.nombre,
      });

      // El token se pide DENTRO del bucle: una subida de 106 fotos en 3G puede
      // durar más que la validez del que se pidió al principio, y el SDK lo
      // renueva solo cuando toca. Sin esto, la subida se caería a la mitad con
      // un 401 y nadie entendería por qué justo ahí.
      const token = await u.getIdToken();
      const r = await fetch(`${PORTERO}/subir?${donde}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
        body: f.archivo,
      });

      if (!r.ok) {
        const detalle = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
        fuera.push({ punto: f.punto, archivo: f.nombre, motivo: HUMANO[r.status] ?? detalle.error ?? `HTTP ${r.status}` });
        continue;
      }

      // RED 3: el portero contesta «ya estaba» y no escribió nada. Y de su
      // respuesta sale la RUTA REAL del objeto: es él quien la decide.
      const acuse = await r.json().catch(() => ({}));
      const yaEstaba = acuse?.yaEstaba === true;
      const clave = String(acuse?.rutaObjeto ?? '');
      if (!clave) {
        fuera.push({ punto: f.punto, archivo: f.nombre, motivo: 'el depósito no devolvió dónde quedó guardada la fotografía' });
        continue;
      }

      // RED 4: el id sale de la HUELLA. La misma foto cae en el mismo documento.
      fichas.push({
        id: await idDeEvidencia(contexto.codigoLinea, sha256),
        apoyoId: f.apoyoId,
        lineaId: contexto.lineaId,
        rutaObjeto: clave,
        sha256,
        bytes: f.archivo.size,
        mime: String(acuse?.mime ?? f.archivo.type ?? 'image/jpeg'),
        tomadaEn: f.tomadaEn,
        punto: f.punto,
      });
      intentos.push({ punto: f.punto, archivo: f.nombre, entro: true, yaEstaba });
    } catch (e) {
      // Una foto que falla NO tumba el lote. El motivo viaja con SU archivo: un
      // «no se pudo subir» genérico pierde justo lo que dice qué hacer.
      fuera.push({
        punto: f.punto, archivo: f.nombre,
        motivo: e instanceof Error ? e.message : 'no se pudo subir',
      });
    }
  }

  // Las fichas, DESPUÉS de los objetos y en un solo acto. Si esto falla, lo que
  // queda son objetos huérfanos: unos megas que no ve nadie, y que repetir la
  // subida no duplica. Al revés —fichas primero— quedarían fichas apuntando al
  // vacío, que es lo que la galería enseña como error.
  let resultado: ResultadoFotos | null = null;
  if (fichas.length) {
    resultado = await repositorio.crearEvidencias(fichas);
    for (const x of resultado.fuera) {
      fuera.push(x);
      const i = intentos.findIndex((t) => t.archivo === x.archivo || t.punto === x.punto);
      if (i >= 0) intentos.splice(i, 1);
    }
  }

  return { intentos, fuera, fichas: resultado };
}
