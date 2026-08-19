#!/usr/bin/env python3
# ============================================================================
# construir-raster.py — de una imagen de satélite abierta a teselas propias
# ----------------------------------------------------------------------------
# POR QUÉ EXISTE. El mapa de este sistema no le pide NADA a ningún servidor de
# terceros: las teselas, las fuentes y los sprites viajan con el sitio (ADR-001).
# Esa decisión no era estética — era la única forma de no depender de una cuota,
# de un contrato o de una licencia que prohíbe el uso comercial, y de que el modo
# campo sin señal (F4) pueda existir algún día. Una capa satelital «de las de
# siempre» (Esri, Google, Mapbox) rompería las tres cosas a la vez.
#
# La salida es la MISMA que ya usa el mapa base: un archivo `.pmtiles` que se
# sirve desde el propio sitio. Aquí se construye una vez, a mano, y se commitea.
#
# ⚠️ EL RECORTE ES EL ÁREA METROPOLITANA ENTERA, igual que el mapa base y por la
# misma razón: un recorte ceñido al corredor DELATARÍA el corredor, y este
# repositorio es público (`33 · L-23`). El bbox se toma del propio mapa base.
#
# QUÉ NO HACE: no inventa un píxel. Lo que la escena no cubre queda transparente.
#
# ── Fuentes y licencias (verificadas el 2026-08-19, con su fuente) ───────────
#
#   · SATELITAL — Copernicus Sentinel-2 L2A, color verdadero (TCI), 10 m.
#     Política de datos Copernicus: acceso «free, full and open», SIN restricción
#     de uso comercial; único deber, la atribución.
#     https://www.esa.int/Applications/Observing_the_Earth/Copernicus/Free_access_to_Copernicus_Sentinel_satellite_data
#     Copias públicas y anónimas en AWS Open Data (Element 84): no hace falta
#     cuenta, ni clave, ni tarjeta.
#
#   · TÉRMICO — Landsat 8/9 Collection 2 Nivel 2, banda ST_B10 (temperatura de
#     la SUPERFICIE, 100 m remuestreados a 30 m). Producto del USGS: dominio
#     público, sin restricción de uso. Copia anónima en Microsoft Planetary
#     Computer (el testigo de lectura se pide sin cuenta).
#
#   ⚠️ LO QUE MIDE EL TÉRMICO NO ES LA TEMPERATURA DEL AIRE. Es la del SUELO y
#   los tejados, vista desde arriba, EN UN INSTANTE (el paso del satélite). Al
#   mediodía el asfalto puede estar 15-20 °C por encima del aire. NO alimenta —
#   ni puede alimentar— la ecuación de cambio de estado ni ninguna hipótesis de
#   cálculo: eso se hace con temperatura del AIRE. Sirve para VER el ambiente
#   térmico del corredor, no para dictaminar con él.
#
# ── Uso ─────────────────────────────────────────────────────────────────────
#   python3 -m venv .venv && .venv/bin/pip install rasterio pillow
#   .venv/bin/python herramientas/teselas/construir-raster.py satelital
#   .venv/bin/python herramientas/teselas/construir-raster.py termico
#
# Necesita además el binario `pmtiles` (brew install pmtiles) para empaquetar.
# ============================================================================
import argparse
import json
import math
import os
import sqlite3
import subprocess
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from io import BytesIO

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.vrt import WarpedVRT
from rasterio.windows import from_bounds
from PIL import Image

# ── El recorte: EXACTAMENTE el del mapa base ────────────────────────────────
# Si estos números se separan de los del `cartagena.pmtiles`, una capa enseñaría
# territorio que la otra no y el borde parecería un fallo del mapa.
BBOX = (-75.62, 10.20, -75.33, 10.58)   # lon_min, lat_min, lon_max, lat_max
Z_MIN, Z_MAX = 8, 14                     # 14 ≈ 9,4 m/píxel a esta latitud: el nativo de Sentinel-2
METROS_SENTINEL = 9.5                    # la resolución REAL de Sentinel-2. Pedir más no da más
METROS_LANDSAT = 30                      # la rejilla en que se entrega Landsat L2 (sensor: 100 m)
TESELA = 256
TOPE_MIB = 25                            # Cloudflare Pages: 25 MiB por archivo (verificado 2026-08-19)

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SALIDA = os.path.join(RAIZ, 'web', 'public', 'mapas')

E = 20037508.342789244                   # medio mundo en Web Mercator, en metros


# ── Mercator ────────────────────────────────────────────────────────────────

def a_mercator(lon, lat):
    x = E * lon / 180.0
    y = math.log(math.tan((90.0 + lat) * math.pi / 360.0)) / (math.pi / 180.0)
    return x, E * y / 180.0


def tesela_de(lon, lat, z):
    n = 2 ** z
    xt = int((lon + 180.0) / 360.0 * n)
    lat_r = math.radians(lat)
    yt = int((1.0 - math.log(math.tan(lat_r) + 1.0 / math.cos(lat_r)) / math.pi) / 2.0 * n)
    return xt, yt


def limites_tesela(x, y, z):
    """Los bordes de una tesela XYZ en metros Web Mercator."""
    lado = 2 * E / (2 ** z)
    x0 = -E + x * lado
    y1 = E - y * lado
    return x0, y1 - lado, x0 + lado, y1


def la_mas_reciente_despejada(escenas, margen_pp=1.0):
    """
    De las candidatas, la MÁS RECIENTE entre las prácticamente despejadas.

    Elegir «la de menos nubes» a secas trae la mejor foto del archivo entero, que
    puede ser de hace ocho meses: en una línea eso enseña la vegetación de otra
    temporada, y la vegetación es justo lo que se va a mirar. Entre dos escenas
    con 0,39 % y 0,46 % de nubes no hay diferencia práctica; entre diciembre y
    julio, sí. Se toma la mejor, se admite hasta un punto porcentual más de
    nubes, y de ese grupo manda la fecha.
    """
    limpio = min(e['properties'].get('eo:cloud_cover') or 0 for e in escenas)
    grupo = [e for e in escenas if (e['properties'].get('eo:cloud_cover') or 0) <= limpio + margen_pp]
    return max(grupo, key=lambda e: e['properties']['datetime'])


# ── Lectura de la escena, UNA sola vez ──────────────────────────────────────

def tamano_bloque(metros_px):
    """Cuántos píxeles ocupa el recorte a esa resolución, en Web Mercator."""
    x0, y0 = a_mercator(BBOX[0], BBOX[1])
    x1, y1 = a_mercator(BBOX[2], BBOX[3])
    return (int(round((x1 - x0) / metros_px)), int(round((y1 - y0) / metros_px)), (x0, y0, x1, y1))


def leer_bloque(url, bandas, metros_px, remuestreo=Resampling.bilinear):
    """
    La zona del recorte, ya en Web Mercator y a la resolución que se pida.

    Se lee de UNA vez y no tesela a tesela: cada lectura por `/vsicurl` es una
    petición de rango a un servidor al otro lado del mundo, y trocearla en 250
    peticiones convierte un minuto en media hora.

    ⚠️ `metros_px` NO se elige por gusto: se pone la resolución REAL del producto.
    Leer Landsat a 10 m no inventa detalle, solo multiplica por nueve el peso del
    archivo y hace creer que hay una precisión que el sensor no tiene.
    """
    ancho, alto, limites = tamano_bloque(metros_px)
    print(f'   leyendo {ancho}×{alto} px ({metros_px:g} m/píxel) desde la escena…')
    with rasterio.open(url) as src:
        with WarpedVRT(src, crs='EPSG:3857', resampling=remuestreo) as vrt:
            ventana = from_bounds(*limites, vrt.transform)
            datos = vrt.read(bandas, window=ventana, out_shape=(len(bandas), alto, ancho),
                             resampling=remuestreo)
    return datos, limites


def recortar(imagen, limites_bloque, x, y, z):
    """
    Una tesela, sacada del bloque en memoria. Fuera del bloque = transparente.

    ⚠️ La imagen que entra tiene que ser la del NIVEL z de la pirámide, no la de
    resolución máxima: una tesela de z8 abarca 150 km, y recortarla del bloque
    nativo pediría un rectángulo de 268 millones de píxeles — que además de
    absurdo dispara el guardián anti-bomba de Pillow.
    """
    bx0, by0, bx1, by1 = limites_bloque
    tx0, ty0, tx1, ty1 = limites_tesela(x, y, z)
    ancho_px = imagen.width / (bx1 - bx0)
    alto_px = imagen.height / (by1 - by0)
    izq = (tx0 - bx0) * ancho_px
    der = (tx1 - bx0) * ancho_px
    arr = (by1 - ty1) * alto_px
    aba = (by1 - ty0) * alto_px
    # `Image.crop` fuera de los bordes rellena con 0 (transparente con alfa).
    return imagen.crop((round(izq), round(arr), round(der), round(aba))).resize(
        (TESELA, TESELA), Image.Resampling.LANCZOS)


# ── Empaquetado ─────────────────────────────────────────────────────────────

def escribir_mbtiles(ruta, teselas, formato, nombre, atribucion, descripcion):
    if os.path.exists(ruta):
        os.remove(ruta)
    con = sqlite3.connect(ruta)
    con.execute('CREATE TABLE metadata (name text, value text)')
    con.execute('CREATE TABLE tiles (zoom_level integer, tile_column integer,'
                ' tile_row integer, tile_data blob)')
    con.execute('CREATE UNIQUE INDEX i ON tiles (zoom_level, tile_column, tile_row)')
    meta = {
        'name': nombre, 'format': formato, 'type': 'baselayer', 'version': '1',
        'description': descripcion, 'attribution': atribucion,
        'bounds': ','.join(str(v) for v in BBOX),
        'center': f'{(BBOX[0] + BBOX[2]) / 2},{(BBOX[1] + BBOX[3]) / 2},12',
        'minzoom': str(Z_MIN), 'maxzoom': str(Z_MAX),
    }
    con.executemany('INSERT INTO metadata VALUES (?,?)', meta.items())
    # MBTiles usa TMS (la fila crece hacia arriba); las teselas se generan en XYZ.
    con.executemany('INSERT INTO tiles VALUES (?,?,?,?)',
                    [(z, x, (2 ** z - 1) - y, sqlite3.Binary(b)) for (z, x, y), b in teselas.items()])
    con.commit()
    con.close()


def empaquetar(mbtiles, pmtiles):
    if os.path.exists(pmtiles):
        os.remove(pmtiles)
    subprocess.run(['pmtiles', 'convert', mbtiles, pmtiles], check=True,
                   stdout=subprocess.DEVNULL)
    os.remove(mbtiles)
    mib = os.path.getsize(pmtiles) / 1024 / 1024
    print(f'\n✅ {os.path.basename(pmtiles)} — {mib:.1f} MiB')
    if mib > TOPE_MIB:
        print(f'\n❌ Pasa de los {TOPE_MIB} MiB que admite Cloudflare Pages por archivo.'
              f'\n   No se sube así: baje Z_MAX o suba la compresión.')
        sys.exit(1)
    return mib


def generar(imagen, limites, guardar):
    """
    Recorre los zooms de MAYOR a menor, halvando la imagen en cada paso.

    Cada nivel se saca del anterior y no del original: es la pirámide de toda la
    vida, y de paso mantiene el recorte de cada tesela en unos pocos centenares
    de píxeles pase lo que pase con el zoom.
    """
    teselas = {}
    actual = imagen
    for z in range(Z_MAX, Z_MIN - 1, -1):
        if z < Z_MAX:
            actual = actual.resize((max(1, actual.width // 2), max(1, actual.height // 2)),
                                   Image.Resampling.LANCZOS)
        x0, y0 = tesela_de(BBOX[0], BBOX[3], z)     # esquina noroeste
        x1, y1 = tesela_de(BBOX[2], BBOX[1], z)     # esquina sureste
        n = 0
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                bruto = guardar(recortar(actual, limites, x, y, z))
                if bruto:
                    teselas[(z, x, y)] = bruto
                    n += 1
        print(f'   z{z}: {n} tesela(s)')
    return teselas


# ════════════════════════════════════════════════════════════════════════════
# 1 · SATELITAL — Sentinel-2, color verdadero
# ════════════════════════════════════════════════════════════════════════════

# Percentiles del realce. El color verdadero de Sentinel-2 sale apagado —está
# pensado para analizar, no para mirar—, y un mapa base apagado se lee peor que
# uno con contraste. Se estira entre estos dos percentiles, IGUALES para las tres
# bandas para no torcer el color, y queda DECLARADO en la ficha: la imagen sirve
# para ver el terreno, no para comparar radiometría entre fechas.
REALCE_PCT = (2.0, 98.0)


def realzar(rgb, valido):
    """Estiramiento lineal de contraste entre dos percentiles. Puro cosmético."""
    muestra = rgb[valido]
    if muestra.size == 0:
        return rgb
    lo, hi = np.percentile(muestra, REALCE_PCT)
    if hi <= lo:
        return rgb
    estirado = (rgb.astype(np.float32) - lo) * (255.0 / (hi - lo))
    return np.clip(estirado, 0, 255).astype(np.uint8)


def buscar_sentinel(meses=12):
    # ⚠️ RECIENTE Y limpia, en ese orden. Ordenar solo por nubes trae la escena
    # más limpia de todo el archivo — que puede ser de hace tres años, y una
    # imagen de hace tres años enseña vegetación que ya se podó, o que ya creció
    # hasta el conductor. Se acota primero la ventana de tiempo y dentro de ella
    # se elige la más limpia.
    desde = (datetime.now(timezone.utc) - timedelta(days=30 * meses)).strftime('%Y-%m-%dT00:00:00Z')
    cuerpo = json.dumps({
        'collections': ['sentinel-2-l2a'],
        'bbox': list(BBOX),
        'datetime': f'{desde}/..',
        'query': {'eo:cloud_cover': {'lt': 5}},
        'limit': 30,
        'sortby': [{'field': 'properties.eo:cloud_cover', 'direction': 'asc'}],
    }).encode()
    req = urllib.request.Request('https://earth-search.aws.element84.com/v1/search',
                                 data=cuerpo, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=90) as r:
        d = json.load(r)
    if not d.get('features'):
        sys.exit('❌ ninguna escena con menos del 5 % de nubes sobre el recorte')
    f = la_mas_reciente_despejada(d['features'])
    return {
        'id': f['id'],
        'fecha': f['properties']['datetime'],
        'nubes_pct': f['properties'].get('eo:cloud_cover'),
        'url': f['assets']['visual']['href'],
    }


def satelital():
    escena = buscar_sentinel()
    print(f"🛰️  Sentinel-2 {escena['id']} · {escena['fecha'][:10]} · "
          f"{escena['nubes_pct']:.2f} % de nubes")
    datos, limites = leer_bloque('/vsicurl/' + escena['url'], [1, 2, 3], METROS_SENTINEL)

    rgb = np.moveaxis(datos, 0, -1)
    # Lo que no cubre la escena llega como 0 en las tres bandas: se declara
    # transparente en vez de pintarlo de negro, que se leería como agua.
    alfa = (rgb.sum(axis=2) > 0).astype(np.uint8) * 255
    rgb = realzar(rgb, alfa > 0)
    imagen = Image.fromarray(np.dstack([rgb, alfa]), 'RGBA')

    def guardar(t):
        if t.getchannel('A').getextrema()[1] == 0:
            return None                          # tesela entera fuera de la escena
        buf = BytesIO()
        # Calidad alta a propósito: estas teselas se MIRAN AMPLIADAS —el zoom del
        # mapa pasa de largo la resolución del satélite— y ampliar una compresión
        # agresiva convierte sus artefactos en manchas que parecen terreno.
        t.save(buf, format='WEBP', quality=90, method=5)
        return buf.getvalue()

    teselas = generar(imagen, limites, guardar)
    mb = os.path.join(SALIDA, 'cartagena-satelital.mbtiles')
    escribir_mbtiles(
        mb, teselas, 'webp', 'Sentinel-2 color verdadero',
        'Contains modified Copernicus Sentinel data ' + escena['fecha'][:4],
        f"Sentinel-2 L2A {escena['id']} · {escena['fecha'][:10]} · "
        f"{escena['nubes_pct']:.2f} % de nubes · 10 m")
    mib = empaquetar(mb, os.path.join(SALIDA, 'cartagena-satelital.pmtiles'))

    escribir_ficha('satelital', {
        'capa': 'satelital',
        'titulo': 'Satelital (Sentinel-2, 10 m)',
        'escena': escena['id'],
        'fecha': escena['fecha'],
        'nubes_pct': round(escena['nubes_pct'], 2),
        'resolucion_m': 10,
        'realce': f'contraste estirado entre los percentiles {REALCE_PCT[0]} y {REALCE_PCT[1]} '
                  '— cosmético: sirve para ver el terreno, no para comparar radiometría',
        'fuente': 'Copernicus Sentinel-2 L2A (ESA), copia abierta en AWS Open Data',
        'licencia': 'Copernicus: acceso libre, pleno y abierto — uso comercial permitido',
        'atribucion': 'Contains modified Copernicus Sentinel data ' + escena['fecha'][:4],
        'peso_mib': round(mib, 1),
    })


# ════════════════════════════════════════════════════════════════════════════
# 2 · TÉRMICO — Landsat, temperatura de la SUPERFICIE
# ════════════════════════════════════════════════════════════════════════════

# Del manual del producto (USGS Collection 2 Level-2): el número guardado se
# convierte a kelvin con esta escala y este desplazamiento. No es un ajuste.# Del manual del producto (USGS Collection 2 Level-2): el número guardado se
# convierte a kelvin con esta escala y este desplazamiento. No es un ajuste.
ST_ESCALA, ST_DESPLAZAMIENTO = 0.00341802, 149.0

# ── Cómo se guarda la temperatura, y por qué así ────────────────────────────
#
# ⚠️ ESTO YA NO SON TESELAS DE COLOR: es la MEDIDA. Antes se guardaba una imagen
# ya pintada, y una imagen pintada solo sirve para mirarla: no se puede preguntar
# «¿cuántos grados hay AQUÍ?» ni cambiar la escala sin volver a construirlo todo.
# Ahora se guarda una rejilla de VALORES —un byte por celda— y el color lo pone
# el navegador. De ahí salen tres cosas que antes no se podían: elegir el día,
# leer los grados de un punto con un clic, y que el mapa no se vea a cuadros al
# acercarse, porque una imagen de valores se interpola sola.
#
# Un byte por celda con paso de 0,3 °C: la incertidumbre del producto es del
# orden de 1-2 K, así que guardar décimas sería guardar ruido con más ceros.
# El 0 queda reservado para SIN DATO — que no es lo mismo que 0 °C.
GRID_OFFSET_C, GRID_PASO_C = -10.0, 0.3
GRID_SIN_DATO = 0

# La rampa. Se elige DIVERGENTE y con anclas fijas en °C, no estirada al máximo
# y al mínimo de la escena: una rampa que se reescala sola hace que dos mapas de
# días distintos pinten el mismo color sobre temperaturas distintas, y entonces
# comparar dos fechas engaña. Los cortes van en la leyenda, escritos.
#
# ⚠️ Los cortes están puestos donde está el DATO, no repartidos a ojo: en este
# recorte el 90 % de la superficie cae entre 28 y 49 °C a la hora del paso del
# satélite, así que la mitad caliente de la rampa lleva un color cada 3 °C. Con
# los cortes repartidos por igual, media ciudad salía del mismo rojo y el mapa no
# enseñaba nada — que es como una capa acaba apagada para siempre.
RAMPA = [
    (20, (49, 54, 149)), (26, (69, 117, 180)), (30, (116, 173, 209)),
    (33, (200, 228, 238)), (36, (255, 245, 190)), (39, (254, 224, 144)),
    (42, (253, 174, 97)), (45, (244, 109, 67)), (48, (215, 48, 39)),
    (52, (165, 0, 38)), (58, (103, 0, 24)),
]

# ── La máscara de nubes ─────────────────────────────────────────────────────
#
# ⚠️ SIN ESTO, LA CAPA MIENTE DONDE MÁS PARECE ACERTAR. Bajo una nube el sensor
# térmico no mide el suelo: mide el TECHO DE LA NUBE, que está veinte grados más
# frío. Esos píxeles saldrían azules en mitad de la ciudad y se leerían como una
# zona fresca. Se marcan como SIN DATO, que es lo que son.
#
# Bits del `qa_pixel` de Landsat Collection 2 (del manual del producto):
#   0 relleno · 1 nube dilatada · 2 cirros · 3 nube · 4 sombra de nube
QA_BITS_MALOS = (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4)


def buscar_landsat(meses=14, nubes_max=25, tope=None):
    """
    Las escenas utilizables del último año, de la más reciente a la más vieja.

    Se admite hasta un 25 % de nubes y NO por descuido: la nubosidad es de la
    escena entera —110 km de lado— y el recorte es una esquina. Lo que decide si
    una fecha sirve es cuánto del RECORTE queda sin nube, y eso solo se sabe
    después de leerla y aplicarle la máscara. Aquí se filtra grueso; el filtro
    fino está en `termico()`, que descarta la fecha si se queda sin cobertura.
    """
    desde = (datetime.now(timezone.utc) - timedelta(days=30 * meses)).strftime('%Y-%m-%dT00:00:00Z')
    cuerpo = json.dumps({
        'collections': ['landsat-c2-l2'],
        'bbox': list(BBOX),
        'datetime': f'{desde}/..',
        'query': {'eo:cloud_cover': {'lt': nubes_max},
                  'platform': {'in': ['landsat-8', 'landsat-9']}},
        'limit': 100,
        'sortby': [{'field': 'properties.datetime', 'direction': 'desc'}],
    }).encode()
    req = urllib.request.Request('https://planetarycomputer.microsoft.com/api/stac/v1/search',
                                 data=cuerpo, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=90) as r:
        d = json.load(r)
    if not d.get('features'):
        sys.exit(f'❌ ninguna escena Landsat con menos del {nubes_max} % de nubes sobre el recorte')

    with urllib.request.urlopen(
            'https://planetarycomputer.microsoft.com/api/sas/v1/token/landsat-c2-l2',
            timeout=60) as r:
        testigo = json.load(r)['token']

    escenas = []
    for f in d['features'][: (tope or 999)]:
        pr = f['properties']
        con = lambda clave: f['assets'][clave]['href'].split('?')[0] + '?' + testigo
        escenas.append({
            'id': f['id'],
            'fecha': pr['datetime'],
            'nubes_pct': pr.get('eo:cloud_cover'),
            'plataforma': pr.get('platform'),
            'url': con('lwir11'),
            'url_qa': con('qa_pixel'),
        })
    return escenas


def rejilla_de_una_fecha(escena):
    """
    Una fecha, leída y convertida a grados. Devuelve `None` si no sirve.

    Se descarta —y se dice— cuando la nube o el borde de la pasada dejan el
    recorte con menos de la mitad de celdas medidas: media ciudad en blanco no es
    un mapa de temperatura, es un mapa de nubes.
    """
    datos, _ = leer_bloque('/vsicurl/' + escena['url'], [1], METROS_LANDSAT)
    qa, _ = leer_bloque('/vsicurl/' + escena['url_qa'], [1], METROS_LANDSAT,
                        remuestreo=Resampling.nearest)   # una máscara NO se interpola

    bruto = datos[0].astype(np.float32)
    tapado = (qa[0].astype(np.uint16) & QA_BITS_MALOS) != 0
    valido = (bruto > 0) & (~tapado)
    cobertura = float(100 * valido.mean())
    if cobertura < 50:
        print(f'   ↷ {escena["fecha"][:10]}: solo {cobertura:.0f} % del recorte medido — se descarta')
        return None

    celsius = (bruto * ST_ESCALA + ST_DESPLAZAMIENTO) - 273.15
    medidos = celsius[valido]

    # A un byte por celda. Se recorta al rango representable y se DICE si se
    # recortó algo: un valor pegado al tope es un valor que ya no es el medido.
    indices = np.round((celsius - GRID_OFFSET_C) / GRID_PASO_C) + 1
    fuera = int(np.count_nonzero(valido & ((indices < 1) | (indices > 255))))
    indices = np.clip(indices, 1, 255)
    rejilla = np.where(valido, indices, GRID_SIN_DATO).astype(np.uint8)

    return {
        'escena': escena['id'],
        'fecha': escena['fecha'],
        'plataforma': escena['plataforma'],
        'nubes_pct': round(escena['nubes_pct'], 1),
        'cobertura_pct': round(cobertura, 1),
        'fuera_de_rango': fuera,
        'resumen_c': {
            'min_c': round(float(np.min(medidos)), 1),
            'p05_c': round(float(np.percentile(medidos, 5)), 1),
            'p50_c': round(float(np.percentile(medidos, 50)), 1),
            'p95_c': round(float(np.percentile(medidos, 95)), 1),
            'max_c': round(float(np.max(medidos)), 1),
        },
        'rejilla': rejilla,
    }


def termico(cuantas=12):
    escenas = buscar_landsat()
    print(f'🌡️  {len(escenas)} escena(s) candidatas; se buscan {cuantas} fechas utilizables')
    ancho, alto, _ = tamano_bloque(METROS_LANDSAT)

    fechas = []
    for e in escenas:
        if len(fechas) >= cuantas:
            break
        print(f'   · {e["fecha"][:10]} ({e["nubes_pct"]:.0f} % de nubes en la escena)')
        try:
            r = rejilla_de_una_fecha(e)
        except Exception as err:                      # noqa: BLE001 — una escena rota no tumba el lote
            print(f'   ↷ {e["fecha"][:10]}: no se pudo leer ({err})')
            continue
        if r is None:
            continue
        nombre = f'cartagena-termico-{r["fecha"][:10]}.png'
        Image.fromarray(r.pop('rejilla'), 'L').save(os.path.join(SALIDA, nombre), optimize=True)
        r['archivo'] = nombre
        r['peso_kib'] = round(os.path.getsize(os.path.join(SALIDA, nombre)) / 1024, 1)
        print('     ✓ {fecha} · {cobertura_pct} % medido · mediana {p50} °C · {peso} KiB'.format(
            fecha=r['fecha'][:10], cobertura_pct=r['cobertura_pct'],
            p50=r['resumen_c']['p50_c'], peso=r['peso_kib']))
        fechas.append(r)

    if not fechas:
        sys.exit('❌ ninguna fecha quedó utilizable tras aplicar la máscara de nubes')

    total = sum(f['peso_kib'] for f in fechas) / 1024
    print(f'\n✅ {len(fechas)} fecha(s) · {total:.1f} MiB en total')

    escribir_ficha('termico', {
        'capa': 'termico',
        'titulo': 'Temperatura de la superficie (Landsat)',
        # La rejilla vive en Web Mercator y cubre EXACTAMENTE el recorte: la
        # pantalla la coloca por sus cuatro esquinas, sin reproyectar nada.
        'bbox': list(BBOX),
        'ancho': ancho,
        'alto': alto,
        'resolucion_m': METROS_LANDSAT,
        'resolucion_nativa_m': 100,
        'codificacion': {
            'nota': 'byte 0 = SIN DATO (nube, sombra o fuera de la pasada). '
                    'Con byte v ≥ 1: °C = (v − 1) × paso + offset',
            'offset_c': GRID_OFFSET_C,
            'paso_c': GRID_PASO_C,
            'sin_dato': GRID_SIN_DATO,
        },
        'rampa': [{'c': t, 'rgb': list(c)} for t, c in RAMPA],
        'fechas': fechas,
        'fuente': 'USGS Landsat Collection 2 Level-2, banda ST_B10 · copia abierta en '
                  'Microsoft Planetary Computer',
        'licencia': 'USGS: dominio público, sin restricción de uso',
        'atribucion': 'USGS Landsat Collection 2 Level-2',
        'es_superficie_no_aire': True,
        'mascara': 'nubes, cirros, sombra de nube y relleno marcados como SIN DATO con el '
                   '`qa_pixel` del propio producto: bajo una nube el sensor mide el techo de la '
                   'nube, no el suelo',
    })


# ── La ficha que lee la aplicación ──────────────────────────────────────────

def escribir_ficha(nombre, ficha):
    """
    Los metadatos que la pantalla NECESITA para no mentir: qué día se tomó, con
    qué resolución, de dónde salió y a quién hay que atribuirlo. Sin esto, la
    capa sería una imagen bonita sin fecha — y una imagen sin fecha en una
    herramienta de mantenimiento se lee como «así está hoy».
    """
    ruta = os.path.join(SALIDA, f'cartagena-{nombre}.json')
    with open(ruta, 'w', encoding='utf-8') as f:
        json.dump(ficha, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(f'   ficha: {os.path.relpath(ruta, RAIZ)}')


if __name__ == '__main__':
    p = argparse.ArgumentParser(description='Construye las capas raster autohospedadas.')
    p.add_argument('capa', choices=['satelital', 'termico'])
    p.add_argument('--fechas', type=int, default=12,
                   help='cuántas fechas utilizables buscar para el térmico')
    args = p.parse_args()
    os.makedirs(SALIDA, exist_ok=True)
    if args.capa == 'satelital':
        satelital()
    else:
        termico(args.fechas)
