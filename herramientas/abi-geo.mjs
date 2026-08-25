#!/usr/bin/env node
// ============================================================================
// abi-geo.mjs — de la rejilla del satélite a las celdas del atlas. PURO.
// ----------------------------------------------------------------------------
// El GOES no entrega latitud y longitud: entrega **ángulos de barrido** (x, y)
// desde un satélite parado sobre el ecuador a 35.786 km. Para saber qué píxel
// cae en qué celda de 1° hay que cruzar esa geometría, y es donde se cuelan los
// errores que nadie ve: un mapa desplazado unos píxeles sigue pareciendo un
// mapa, solo que el dato de Riohacha aparece sobre Valledupar.
//
// ⚠️ LAS CONSTANTES SE LEEN DEL ARCHIVO, NUNCA SE ESCRIBEN AQUÍ. Cada `.nc`
// declara su `goes_imager_projection` —altura del satélite, ejes del elipsoide,
// longitud del subpunto— y el día que NOAA mueva el satélite o cambie de
// vehículo, el archivo lo dirá y esto seguirá siendo correcto. Clavarlas aquí
// sería una bomba de relojería silenciosa: el mapa saldría igual de bonito y
// desplazado (`33 · L-53`, la familia del número que se firma).
//
// La geometría es la del documento oficial del producto (GOES-R PUG, sección de
// la «ABI fixed grid»), y aquí se comprueba de tres formas: el subpunto del
// satélite tiene que caer en (0,0), la ida y vuelta tiene que cerrar, y un punto
// fuera del disco tiene que devolver `null` en vez de un número creíble.
// ============================================================================

/** Lo que hace falta saber del archivo para cruzar su rejilla con el mundo. */
export function geometriaDe(proyeccion) {
  const { perspective_point_height: h, semi_major_axis: req, semi_minor_axis: rpol,
    longitude_of_projection_origin: lon0 } = proyeccion;
  return {
    H: h + req,          // del centro de la Tierra al satélite
    req,
    rpol,
    lon0,
    e2: 1 - (rpol * rpol) / (req * req),
  };
}

const RAD = Math.PI / 180;

/**
 * DE UN PUNTO DEL MUNDO AL ÁNGULO DE BARRIDO. Devuelve `null` si el punto no se
 * ve desde el satélite (está al otro lado de la Tierra): un `null` es un dato
 * —«aquí no mira»— y un número inventado sería un píxel del otro hemisferio.
 */
export function anguloDe(lon, lat, g) {
  const { H, req, rpol, lon0, e2 } = g;
  // Latitud GEOCÉNTRICA: la Tierra es un elipsoide y el satélite ve el centro,
  // no el vertical del lugar. Confundirlas desplaza el punto decenas de km.
  const fc = Math.atan(((rpol * rpol) / (req * req)) * Math.tan(lat * RAD));
  const rc = rpol / Math.sqrt(1 - e2 * Math.cos(fc) * Math.cos(fc));
  const dl = (lon - lon0) * RAD;
  const sx = H - rc * Math.cos(fc) * Math.cos(dl);
  const sy = -rc * Math.cos(fc) * Math.sin(dl);
  const sz = rc * Math.sin(fc);
  // ⚠️ LA COMPROBACIÓN DE VISIBILIDAD, y no es opcional: sin ella, un punto del
  // otro lado del planeta devuelve ángulos perfectamente creíbles.
  if (H * (H - sx) < sy * sy + ((req * req) / (rpol * rpol)) * sz * sz) return null;
  return {
    x: Math.asin(-sy / Math.sqrt(sx * sx + sy * sy + sz * sz)),
    y: Math.atan(sz / sx),
  };
}

/** Y de vuelta: del ángulo de barrido al punto del mundo. `null` si no toca la Tierra. */
export function puntoDe(x, y, g) {
  const { H, req, rpol, lon0 } = g;
  const k = (req * req) / (rpol * rpol);
  const a = Math.sin(x) ** 2 + Math.cos(x) ** 2 * (Math.cos(y) ** 2 + k * Math.sin(y) ** 2);
  const b = -2 * H * Math.cos(x) * Math.cos(y);
  const c = H * H - req * req;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;                       // la vista se pierde en el espacio
  const rs = (-b - Math.sqrt(disc)) / (2 * a);
  const sx = rs * Math.cos(x) * Math.cos(y);
  const sy = -rs * Math.sin(x);
  const sz = rs * Math.cos(x) * Math.sin(y);
  return {
    lat: Math.atan(k * sz / Math.sqrt((H - sx) ** 2 + sy * sy)) / RAD,
    lon: lon0 - Math.atan(sy / (H - sx)) / RAD,
  };
}

/**
 * EL RECORTE QUE HAY QUE LEER del archivo para cubrir un recuadro del mundo.
 *
 * Se calcula para no leer 29 millones de píxeles cuando hacen falta cien mil: el
 * atlas son 6°x6° sobre un disco que cubre medio planeta. Va con un MARGEN de
 * píxeles a propósito — los bordes del recuadro no caen en el centro de un píxel
 * y sin margen se pierde la fila de fuera, que es justo la que toca la costa.
 *
 * @param ejeX/ejeY los ángulos de barrido del archivo, en orden (x crece al
 *                  este, y DECRECE hacia el sur: fila 0 es el norte).
 */
export function ventanaDe(bbox, ejeX, ejeY, g, margen = 2) {
  const [oeste, sur, este, norte] = bbox;
  const esquinas = [[oeste, norte], [este, norte], [oeste, sur], [este, sur]]
    .map(([lo, la]) => anguloDe(lo, la, g));
  if (esquinas.some((e) => e === null)) return null;   // el recuadro no se ve entero
  const xs = esquinas.map((e) => e.x), ys = esquinas.map((e) => e.y);
  const iDe = (eje, v) => {
    // Los ejes son regulares: se busca por proporción y se ajusta, sin recorrer.
    const paso = (eje[eje.length - 1] - eje[0]) / (eje.length - 1);
    return Math.round((v - eje[0]) / paso);
  };
  const x0 = iDe(ejeX, Math.min(...xs)), x1 = iDe(ejeX, Math.max(...xs));
  // `y` va de mayor a menor: el índice del máximo es el menor.
  const y0 = iDe(ejeY, Math.max(...ys)), y1 = iDe(ejeY, Math.min(...ys));
  return {
    x0: Math.max(0, Math.min(x0, x1) - margen),
    x1: Math.min(ejeX.length - 1, Math.max(x0, x1) + margen),
    y0: Math.max(0, Math.min(y0, y1) - margen),
    y1: Math.min(ejeY.length - 1, Math.max(y0, y1) + margen),
  };
}
