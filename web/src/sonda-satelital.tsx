// ============================================================================
// sonda-satelital.tsx — BANCO DE PRUEBAS del componente REAL del mapa
// ----------------------------------------------------------------------------
// ⚠️ SOLO DESARROLLO. Vite construye únicamente `index.html`, así que esta
// página NO viaja al sitio publicado. No pide sesión, no toca la base y NO
// CONTIENE UNA SOLA COORDENADA DE CLIENTE: los apoyos son sintéticos y se
// derivan en tiempo de ejecución de la cabecera del recorte público del mapa,
// que es un archivo del propio repositorio.
//
// PARA QUÉ. La satelital no se pinta y el sitio real exige sesión, así que cada
// medida allí depende de que alguien abra su navegador. Aquí se monta EL MISMO
// componente `Mapa` —sus efectos, su panel, su interruptor— sobre datos falsos.
// Si aquí falla, el fallo es del componente y se depura sin nadie delante.
//
// ⚠️ Y DESDE `§ADR-074`, TAMBIÉN EL ATLAS. El trazado de la línea dibujado sobre
// el atlas es dibujo de mapa, y `§ADR-071` dejó escrita la regla que costó una
// sesión entera: **no se publica dibujo de mapa que no se pueda mirar**. Las
// pestañas desde las que Claude inspecciona van en segundo plano y MapLibre no
// pinta ahí; este banco sí se ve, y no pide sesión. Con dos líneas falsas —una
// que cabe en UNA celda y otra que cruza DOS— porque son los dos dibujos que el
// atlas tiene que saber hacer, y el segundo no se puede provocar a voluntad con
// la línea real.
// ============================================================================
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Apoyo } from '@lineas/contratos';
import Mapa from './componentes/Mapa';
import { DetalleGps } from './componentes/DetalleGps';
import { recorridoLevantado } from './vistas/recorrido';
import type { Levantamiento } from '@lineas/contratos';
import { AtlasCaribe } from './componentes/AtlasCaribe';
import Cargabilidad from './componentes/Cargabilidad';
import { ATLAS, ATLAS_EN_ORDEN, type ClaveAtlas } from './vistas/atlasCatalogo';
import { CORREDOR, CORREDOR_EN_ORDEN, type ClaveCorredor } from './vistas/corredor';
import { bordeDeCelda, celdaDe } from './vistas/rejilla';
import type { FichaAtlas } from './vistas/atlasCaribe';
import { prepararTeselas } from './datos/teselas';
import './estilo.css';

/**
 * Apoyos SINTÉTICOS. Ni uno solo es real: se colocan en el centro del recorte
 * público —el que declara la cabecera del `.pmtiles` que viaja en este mismo
 * repositorio— y se separan por milésimas de grado. No hay un número de campo
 * escrito en este archivo a propósito: un literal con cuatro decimales en esta
 * franja es exactamente lo que el guardián de fugas bloquea, y con razón.
 */
function apoyosSinteticos(limites: [number, number, number, number]): Apoyo[] {
  const lon0 = (limites[0] + limites[2]) / 2;
  const lat0 = (limites[1] + limites[3]) / 2;
  return Array.from({ length: 6 }, (_, i) => ({
    id: `falso-${i}`,
    tipo: 'apoyo',
    lineaId: 'linea-falsa',
    orden: i,
    tipoPunto: 'Estructura',
    nombreCampo: `F${i + 1}`,
    coordenada: { lat: lat0 + i * 0.002, lon: lon0 + i * 0.002 },
    funcionEstructural: i === 0 || i === 5 ? 'Terminal' : 'Suspensión',
    funcionProcedencia: { origen: 'supuesto', fuente: 'banco de pruebas' },
    version: 1,
    // Dos tramos SIN cable de guarda, para ver cómo se pintan: uno de dos vanos
    // seguidos (F2→F4) y otro suelto (F5→F6). Es dato falso de un banco de
    // pruebas: nunca sale de aquí.
    ...(i === 1 || i === 2 ? { cableGuardaVanoSaliente: 'ausente' } : {}),
    ...(i === 4 ? { cableGuardaVanoSaliente: 'ausente' } : {}),
    ...(i === 0 ? { cableGuardaVanoSaliente: 'presente' } : {}),
  })) as unknown as Apoyo[];
}

/**
 * UNA LÍNEA FALSA DENTRO DEL ATLAS, y sin un solo número escrito aquí.
 *
 * Las coordenadas salen de la ficha PÚBLICA del atlas —el mismo archivo que baja
 * el navegador— y de la geometría de su rejilla: se toma la celda del centro,
 * se pide su recuadro y se coloca la línea DENTRO de ella. Para el caso de dos
 * celdas se cruza el borde derecho, que es el único sitio donde ese dibujo
 * ocurre de verdad.
 *
 * @param cruzando si la línea tiene que cruzar el borde a la celda vecina.
 */
function lineaFalsaEnElAtlas(ficha: FichaAtlas, cruzando: boolean): Apoyo[] {
  const [loMin, laMin, loMax, laMax] = ficha.bbox;
  const loC = (loMin + loMax) / 2, laC = (laMin + laMax) / 2;
  const centro = celdaDe(loC, laC, ficha);
  if (!centro || !bordeDeCelda(centro.ix, centro.iy, ficha)) return [];
  // ⚠️ LA LÍNEA FALSA VA PEGADA AL CENTRO DEL RECORTE, y no al centro de su
  // celda, porque el centro es DONDE ATERRIZA EL ZOOM: pulsar `+` en el mando
  // acerca al centro del mapa, y una línea colocada en otro sitio se sale de
  // cuadro justo cuando se va a mirar de cerca. Que el dibujo se pueda mirar
  // ES el trabajo de este banco.
  const lat = laC + 0.15;
  // Un recorrido corto —milésimas de grado— como el de una línea de verdad: es
  // justo lo que hace que el dibujo se vea como un punto hasta que se acerca.
  // Cruzando, se pone a caballo del meridiano central, que es borde de celda.
  const lon0 = cruzando ? loC - 0.004 : loC + 0.15;
  return Array.from({ length: 8 }, (_, i) => ({
    id: `falso-atlas-${i}`,
    tipo: 'apoyo',
    lineaId: 'linea-falsa',
    orden: i,
    tipoPunto: 'Estructura',
    nombreCampo: `A${i + 1}`,
    coordenada: { lat: lat + i * 0.001, lon: lon0 + i * 0.001 },
    funcionEstructural: i === 0 || i === 7 ? 'Terminal' : 'Suspensión',
    funcionProcedencia: { origen: 'supuesto', fuente: 'banco de pruebas' },
    version: 1,
  })) as unknown as Apoyo[];
}

/**
 * UN LEVANTAMIENTO SINTÉTICO, por el mismo camino que los apoyos de arriba: del
 * centro del recorte público que declara el `.pmtiles` de este repositorio. Ni
 * una coordenada de cliente, ni un literal con decimales escrito a mano.
 *
 * ⚠️ POR QUÉ HACE FALTA (`99 §ADR-138`). Desde que el Detalle GPS también lo ven
 * las líneas SIN torres registradas, hay DOS pantallas que comprobar y sólo una
 * se podía mirar. La otra vivía detrás de la sesión del Ingeniero, así que cada
 * comprobación dependía de que él abriera su navegador — y así se entregaron dos
 * versiones seguidas sin que nadie hubiera visto la pantalla. Aquí se montan las
 * dos, el mismo componente real, sin sesión y sin tocar producción.
 *
 * 12 puntos y no 6: con menos, un recorrido no enseña si el encuadre, los
 * rótulos y el trazado aguantan cuando los puntos se juntan.
 */
function levantamientoSintetico(limites: [number, number, number, number]): Levantamiento {
  const lon0 = (limites[0] + limites[2]) / 2;
  const lat0 = (limites[1] + limites[3]) / 2;
  return {
    id: 'levantamiento-falso',
    tipo: 'levantamiento',
    orgId: 'org-falsa',
    lineaId: 'linea-falsa',
    codigoSerie: 'LN-FALSA',
    fecha: '2026-01-15',
    aparato: 'aparato de banco',
    archivo: { nombre: 'banco.gpx', huella: 'sin-huella', bytes: 0 },
    nota: null,
    creadoEn: '2026-01-15T12:00:00.000Z',
    creadoPor: 'banco',
    revision: 1,
    puntos: Array.from({ length: 12 }, (_, i) => ({
      nombreCampo: `P${i + 1}`,
      lat: lat0 + i * 0.0012,
      lon: lon0 + i * 0.0016,
      ele: 10 + (i % 4),
      instante: null,
      nota: null,
    })),
  } as unknown as Levantamiento;
}

/** Qué se está mirando en el banco. */
type Que = 'mapa' | 'atlas-una' | 'atlas-dos' | 'cargabilidad'
  | 'detalle-torres' | 'detalle-recorrido';

/**
 * EL BANCO SE PUEDE ABRIR YA PUESTO, por la dirección: `?que=atlas-una&atlas=lluvia`.
 *
 * No es una comodidad: es lo que lo hace FOTOGRAFIABLE sin nadie delante. Un
 * Chrome sin cabeza abre una dirección y guarda un PNG, pero no sabe pulsar el
 * botón que monta el atlas — con el estado en la dirección, sí. Así el dibujo
 * del mapa se puede MIRAR de verdad en lugar de darlo por bueno (`§ADR-074`),
 * que es la regla que dejó `§ADR-071`.
 */
function delDirectorio<T extends string>(clave: string, validos: readonly T[], porDefecto: T): T {
  const v = new URLSearchParams(location.search).get(clave);
  return validos.includes(v as T) ? (v as T) : porDefecto;
}

function Banco() {
  const [apoyos, setApoyos] = useState<Apoyo[] | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [que, setQue] = useState<Que>(
    () => delDirectorio<Que>('que',
      ['mapa', 'atlas-una', 'atlas-dos', 'cargabilidad', 'detalle-torres', 'detalle-recorrido'],
      'mapa'));
  const [atlas, setAtlas] = useState<ClaveAtlas>(
    () => delDirectorio<ClaveAtlas>('atlas', ATLAS_EN_ORDEN, 'temperatura'));
  const [ficha, setFicha] = useState<FichaAtlas | null>(null);
  /**
   * ⚠️ LA CAPA FINA DEL CORREDOR, TAMBIÉN POR LA DIRECCIÓN (`§ADR-087`).
   * `?corredor=radiacion` abre el atlas con esa capa ya puesta. Sin esto, las
   * dos capas que acaban de mudarse aquí serían dibujo de mapa que NADIE puede
   * mirar sin abrir un navegador a mano — justo lo que `§ADR-071` prohíbe
   * publicar. El portero abre esta dirección y comprueba que hay dibujo.
   */
  const corredor = delDirectorio<ClaveCorredor | 'no'>(
    'corredor', ['no', ...CORREDOR_EN_ORDEN], 'no');

  const [recorrido, setRecorrido] = useState<ReturnType<typeof recorridoLevantado> | null>(null);

  useEffect(() => {
    void prepararTeselas()
      .then((m) => {
        setApoyos(apoyosSinteticos(m.limites));
        setRecorrido(recorridoLevantado(levantamientoSintetico(m.limites)));
      })
      .catch((e: Error) => setFallo(e.message));
  }, []);

  // La ficha del atlas, para poder colocar la línea falsa DENTRO de una celda.
  useEffect(() => {
    void fetch(ATLAS[atlas].ficha)
      .then((r) => r.json() as Promise<FichaAtlas>)
      .then(setFicha)
      .catch((e: Error) => setFallo(e.message));
  }, [atlas]);

  if (fallo) return <p>⛔ no se pudo preparar la cartografía: {fallo}</p>;
  if (!apoyos) return <p>preparando la cartografía…</p>;

  const falsa = ficha ? lineaFalsaEnElAtlas(ficha, que === 'atlas-dos') : [];
  return (
    <>
      <div className="acciones" role="group" aria-label="Qué se prueba">
        <button type="button" className={'boton chico' + (que === 'mapa' ? ' activo' : '')}
          onClick={() => setQue('mapa')}>Mapa de la línea</button>
        <button type="button" className={'boton chico' + (que === 'atlas-una' ? ' activo' : '')}
          onClick={() => setQue('atlas-una')}>Atlas · línea en UNA celda</button>
        <button type="button" className={'boton chico' + (que === 'atlas-dos' ? ' activo' : '')}
          onClick={() => setQue('atlas-dos')}>Atlas · línea que cruza DOS</button>
        {/* ⚠️ CARGABILIDAD EN EL BANCO (`§ADR-088`). Esa pantalla vive detrás de
            la sesión, así que mirarla dependía de que el Ingeniero abriera su
            navegador — y además él prohibió cargarle archivos que no son suyos
            contra producción (29-08). Aquí se puede mirar sin sesión, sin tocar
            producción y con un archivo de prueba, que es lo que su orden pide. */}
        <button type="button" className={'boton chico' + (que === 'cargabilidad' ? ' activo' : '')}
          onClick={() => setQue('cargabilidad')}>Cargabilidad eléctrica</button>
        {/* ⚠️ LAS DOS CARAS DEL DETALLE GPS (`§ADR-138`). Una al lado de la otra
            es la única forma honesta de comprobar la PARIDAD que pidió el
            Ingeniero: «la misma interfaz y alcance». Comparar de memoria entre
            dos sesiones es exactamente como se entregan diferencias sin verlas. */}
        <button type="button" className={'boton chico' + (que === 'detalle-torres' ? ' activo' : '')}
          onClick={() => setQue('detalle-torres')}>Detalle GPS · CON torres</button>
        <button type="button" className={'boton chico' + (que === 'detalle-recorrido' ? ' activo' : '')}
          onClick={() => setQue('detalle-recorrido')}>Detalle GPS · SOLO recorrido</button>
      </div>
      {corredor !== 'no' && (
        <p className="fine">
          Banco con la capa fina del corredor puesta: <b>{CORREDOR[corredor].rotulo}</b>.
        </p>
      )}
      {que === 'detalle-torres'
        ? <DetalleGps apoyos={apoyos} codigoLinea="LN-FALSA" codigos={['LN-FALSA']}
            /* ⚠️ SIN NOMBRAR NINGÚN ROL. `puede()` decide por los RECLAMOS del
               token, no por el nombre del rol, así que aquí basta la función
               concreta — y un guardián prohíbe teclear nombres de rol en la
               pantalla (`tests/usuarios-pantalla.test.js`): tienen un dueño y
               no se copian. Me lo cazó él, no yo. */
            sesion={{ claims: { f: ['apoyos.editar'] } } as never} />
        : que === 'detalle-recorrido'
        ? <DetalleGps apoyos={[]} recorrido={recorrido ?? undefined} codigoLinea="LN-FALSA"
            codigos={['LN-FALSA']} />
        : que === 'cargabilidad'
        ? <Cargabilidad lineaAbierta="LN-FALSA" />
        : que === 'mapa'
        ? <Mapa apoyos={apoyos} pantalla="banco-componente-real" />
        : (
          <AtlasCaribe atlas={atlas} alCambiarAtlas={setAtlas}
            corredorInicial={corredor === 'no' ? null : corredor}
            linea={{ codigo: 'LN-FALSA', apoyos: falsa }} />
        )}
    </>
  );
}

createRoot(document.getElementById('raiz')!).render(
  <StrictMode><Banco /></StrictMode>,
);
