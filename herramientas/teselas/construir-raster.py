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
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from io import BytesIO

import numpy as np
from PIL import Image

# ⚠️ `rasterio` NO se importa arriba, y es deliberado: solo lo necesitan las capas
# de IMAGEN (satelital y térmico), que leen GeoTIFF remotos. Las capas de PUNTO
# —recurso solar y temperatura del aire— se construyen con `urllib` y `numpy`, y
# arrastrar GDAL para muestrear un JSON dejaría el script inejecutable en una
# máquina limpia por una dependencia que esa capa no usa.

# ── El recorte: EXACTAMENTE el del mapa base ────────────────────────────────
# Si estos números se separan de los del `cartagena.pmtiles`, una capa enseñaría
# territorio que la otra no y el borde parecería un fallo del mapa.
BBOX = (-75.62, 10.20, -75.33, 10.58)   # lon_min, lat_min, lon_max, lat_max
# ⚠️ Z_MAX 15 NO SIGNIFICA MÁS DETALLE: Sentinel-2 mide a 10 m y ahí se acaba la
# información. Significa que el remuestreo lo hace ESTE script una vez, con un
# filtro bueno, en vez de dejárselo al navegador en cada fotograma. La diferencia
# se ve —el borde deja de escalonarse— y no es información nueva: es la MISMA
# medida, mejor presentada. Queda declarado en la ficha, junto al metro real.
Z_MIN, Z_MAX = 8, 16                     # 16 ≈ 2,4 m/píxel · el DATO sigue siendo de 10 m
METROS_SENTINEL = 9.5                    # la resolución REAL de Sentinel-2. Pedir más no da más
METROS_LANDSAT = 30                      # la rejilla en que se entrega Landsat L2 (sensor: 100 m)
TESELA = 256

# Metros por píxel de cada nivel de zoom A ESTA LATITUD. No es un adorno: es lo
# que separa «a cuánto se publica» de «cuánto mide el dato», y confundirlos es
# vender detalle que no existe. Se calcula, no se escribe a mano, para que
# cambiar Z_MAX no obligue a recordar una tabla.
_LAT_MEDIA = (BBOX[1] + BBOX[3]) / 2
METROS_TESELA_Z = {
    z: 156543.03392 * math.cos(math.radians(_LAT_MEDIA)) / (2 ** z) for z in range(0, 23)
}
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


def leer_bloque(url, bandas, metros_px, remuestreo=None, con_mascara=False):
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
    import rasterio                                       # perezoso: solo capas de imagen
    from rasterio.enums import Resampling
    from rasterio.vrt import WarpedVRT
    from rasterio.windows import from_bounds
    remuestreo = (Resampling.nearest if remuestreo == 'nearest'
                  else Resampling.bilinear if remuestreo is None else remuestreo)
    with rasterio.open(url) as src:
        with WarpedVRT(src, crs='EPSG:3857', resampling=remuestreo) as vrt:
            ventana = from_bounds(*limites, vrt.transform)
            datos = vrt.read(bandas, window=ventana, out_shape=(len(bandas), alto, ancho),
                             resampling=remuestreo)
            # LA MÁSCARA DEL PROPIO ARCHIVO: qué píxeles trae la escena y cuáles
            # son relleno. Es un dato del GeoTIFF, no una suposición sobre el
            # color — y por eso distingue «aquí no hubo pasada» de «aquí el mar
            # refleja casi nada».
            mascara = (vrt.read_masks(1, window=ventana, out_shape=(alto, ancho),
                                      resampling=Resampling.nearest)
                       if con_mascara else None)
    if con_mascara:
        return datos, limites, mascara
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
REALCE_PCT = (1.0, 99.0)
# Gamma < 1 abre las sombras. En una escena tropical con vegetación densa, media
# imagen vive en la parte baja del histograma y el estiramiento lineal solo la
# deja igual de plana pero más clara.
REALCE_GAMMA = 0.88
# Nitidez de máscara borrosa: radio en píxeles y cuánto se refuerza el borde. NO
# inventa detalle —realza el que YA está en la medida—, pero pasado de vueltas
# fabrica halos que parecen caminos. Por eso va suave y por eso se declara.
REALCE_NITIDEZ = (1.0, 0.6)


def realzar(rgb, valido):
    """
    Contraste, gamma y nitidez. TODO ESTO ES COSMÉTICO y va declarado en la ficha.

    La imagen sirve para VER el terreno, no para comparar radiometría entre
    fechas: después de esto, dos escenas ya no son comparables entre sí — y no lo
    eran tampoco antes, porque el estiramiento depende del histograma de cada una.
    """
    muestra = rgb[valido]
    if muestra.size == 0:
        return rgb
    lo, hi = np.percentile(muestra, REALCE_PCT)
    if hi <= lo:
        return rgb
    x = np.clip((rgb.astype(np.float32) - lo) / (hi - lo), 0.0, 1.0)
    x = np.power(x, REALCE_GAMMA)
    return np.clip(x * 255.0, 0, 255).astype(np.uint8)


def enfocar(imagen):
    """
    Máscara borrosa sobre la imagen ya montada.

    Va DESPUÉS del remuestreo y no antes, que es lo que la hace útil: lo que se
    quiere devolver es el borde que la interpolación acaba de suavizar. Se aplica
    solo al color; el canal alfa —qué cubre la escena y qué no— no se toca, porque
    difuminar el alfa dejaría un halo semitransparente en el borde de la escena.
    """
    from PIL import ImageFilter
    radio, fuerza = REALCE_NITIDEZ
    color = imagen.convert('RGB').filter(
        ImageFilter.UnsharpMask(radius=radio, percent=int(fuerza * 100), threshold=2))
    color.putalpha(imagen.getchannel('A'))
    return color


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
    eb = f.get('bbox') or [None] * 4
    return {
        'id': f['id'],
        'fecha': f['properties']['datetime'],
        'nubes_pct': f['properties'].get('eo:cloud_cover'),
        'url': f['assets']['visual']['href'],
        # Lo que decide si el recorte queda LLENO: cuánto relleno trae la escena
        # y si su extensión contiene al recorte entero.
        'sin_dato_pct': f['properties'].get('s2:nodata_pixel_percentage'),
        'contiene_recorte': (None not in eb
                             and eb[0] <= BBOX[0] and eb[1] <= BBOX[1]
                             and eb[2] >= BBOX[2] and eb[3] >= BBOX[3]),
    }


def satelital():
    escena = buscar_sentinel()
    print(f"🛰️  Sentinel-2 {escena['id']} · {escena['fecha'][:10]} · "
          f"{escena['nubes_pct']:.2f} % de nubes")
    # Se pide a la resolución del zoom MÁXIMO, no a la del sensor: el remuestreo
    # de 10 m a 4,7 m lo hace GDAL una vez y bien, en vez de hacerlo el navegador
    # en cada fotograma. La medida sigue siendo de 10 m — eso no lo cambia nadie.
    # ⚠️ Se LEE a 4,7 m y se AMPLÍA a la resolución del zoom máximo, en vez de
    # pedirle a GDAL cuatro veces más píxeles. Da el mismo resultado —el dato
    # de origen es de 10 m, así que todo por debajo es interpolación venga de
    # donde venga— con la cuarta parte de descarga y de memoria: pedir el recorte
    # entero a 2,4 m son ~250 millones de píxeles en RAM.
    metros_lectura = METROS_TESELA_Z[15]
    datos, limites, mascara = leer_bloque('/vsicurl/' + escena['url'], [1, 2, 3],
                                          metros_lectura, con_mascara=True)

    rgb = np.moveaxis(datos, 0, -1)
    # ⚠️ EL HUECO LO DICE EL ARCHIVO, NO EL COLOR. Antes se marcaba como «sin
    # dato» todo píxel con las tres bandas a cero, y eso agujereaba el MAR: el
    # agua profunda no refleja casi nada en el visible, así que el color verdadero
    # sale 0,0,0 y la capa se volvía transparente justo donde sí había medida.
    # Medido sobre el recorte: el 39 % del rectángulo salía vacío y el mar abierto
    # perdía la mitad de sus píxeles. La máscara del GeoTIFF distingue lo que la
    # heurística no podía: «aquí no hubo pasada» de «aquí el mar es negro».
    # ⚠️ SI LA ESCENA LLENA EL RECORTE, NO HAY NADA TRANSPARENTE. Y hay que
    # decidirlo así porque NI EL COLOR NI LA MÁSCARA DEL ARCHIVO SIRVEN: el
    # producto de color verdadero declara el 0 como «sin dato», y el agua
    # profunda vale 0 en las tres bandas porque no refleja casi nada en el
    # visible. Las dos vías —la heurística y `read_masks`— dan el mismo error de
    # origen y agujerean el MAR. Medido: el 39 % del rectángulo salía vacío y el
    # mar abierto perdía la mitad de sus píxeles, que es lo que se veía como una
    # capa incompleta a lo largo de la geografía.
    #
    # El dato que sí lo resuelve es de la escena, no del píxel: si declara 0 % de
    # relleno y su extensión CONTIENE el recorte, entonces cada píxel del recorte
    # fue medido — por oscuro que salga. Cuando no se cumpla, se vuelve a la
    # máscara del archivo, que es lo correcto para un recorte a caballo entre dos
    # pasadas.
    llena = escena.get('contiene_recorte') and (escena.get('sin_dato_pct') or 0) == 0
    alfa = (np.full(rgb.shape[:2], 255, dtype=np.uint8) if llena else mascara)
    print(f'   cobertura: {"COMPLETA (la escena llena el recorte)" if llena else "parcial — se usa la máscara del archivo"}')
    rgb = realzar(rgb, alfa > 0)
    imagen = Image.fromarray(np.dstack([rgb, alfa]), 'RGBA')
    if Z_MAX > 15:
        escala = 2 ** (Z_MAX - 15)
        imagen = imagen.resize((imagen.width * escala, imagen.height * escala), Image.Resampling.LANCZOS)
    # La nitidez va DESPUÉS de ampliar: lo que se quiere devolver es el borde que
    # la interpolación acaba de suavizar.
    imagen = enfocar(imagen)

    def guardar(t):
        if t.getchannel('A').getextrema()[1] == 0:
            return None                          # tesela entera fuera de la escena
        buf = BytesIO()
        # Calidad alta a propósito: estas teselas se MIRAN AMPLIADAS —el zoom del
        # mapa pasa de largo la resolución del satélite— y ampliar una compresión
        # agresiva convierte sus artefactos en manchas que parecen terreno.
        # 82 y no 90: al subir un nivel de zoom los píxeles se multiplican por
        # cuatro y el archivo tiene un tope duro de 25 MiB. Se cede calidad de
        # compresión —que en una imagen ya interpolada casi no se ve— antes que
        # ceder el nivel de zoom, que es lo que el Ingeniero está mirando.
        t.save(buf, format='WEBP', quality=82, method=5)
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
        'cobertura': ('completa: la escena contiene el recorte y no declara relleno'
                      if llena else 'parcial: hay zonas sin pasada, marcadas transparentes'),
        'realce': (f'contraste estirado entre los percentiles {REALCE_PCT[0]} y {REALCE_PCT[1]}, '
                   f'gamma {REALCE_GAMMA} y máscara borrosa (radio {REALCE_NITIDEZ[0]} px, '
                   f'{int(REALCE_NITIDEZ[1] * 100)} %) — TODO cosmético: sirve para ver el terreno, '
                   'no para comparar radiometría'),
        'zoom_max': Z_MAX,
        'metros_por_pixel_publicados': round(METROS_TESELA_Z[Z_MAX], 1),
        # La frase que impide el malentendido: se publica a 4,7 m, pero el dato
        # es de 10 m. Publicar solo lo primero sería vender detalle que no hay.
        'remuestreo': ('las teselas se publican a '
                       f'{round(METROS_TESELA_Z[Z_MAX], 1)} m/píxel, pero la MEDIDA sigue siendo de '
                       f'{METROS_SENTINEL} m: el remuestreo lo hace el generador una vez y con buen '
                       'filtro, en vez de dejárselo al navegador. No es detalle nuevo.'),
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
                        remuestreo='nearest')            # una máscara NO se interpola

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


# ════════════════════════════════════════════════════════════════════════════
# 3 · RADIACIÓN SOLAR — el recurso del corredor, mes a mes
# ════════════════════════════════════════════════════════════════════════════
#
# QUÉ ES Y POR QUÉ IMPORTA EN UNA LÍNEA. La radiación solar no es adorno aquí:
# es una ENTRADA del cálculo térmico. La ampacidad de esta línea (IEEE 738) se
# calcula hoy con **1.000 W/m² ADOPTADOS** —el valor clásico de mediodía
# despejado— sin ninguna fuente local detrás. Este mapa pone por primera vez una
# cifra del sitio al lado de esa suposición.
#
# ⚠️ PERO NO SE CONVIERTE EN AQUELLA CIFRA CON UNA REGLA DE TRES, y esto hay que
# decirlo fuerte: lo que se mapea aquí es ENERGÍA DIARIA (kWh/m² al día) y lo que
# come IEEE 738 es una IRRADIANCIA INSTANTÁNEA (W/m² al mediodía). Son magnitudes
# distintas; pasar de una a otra exige la serie horaria, no un factor. El mapa
# informa; la hipótesis la cambia el Ingeniero, si decide cambiarla.
#
# ── La fuente y su licencia (verificado el 2026-08-19) ───────────────────────
# Global Solar Atlas 2.0 — Solargis para el Grupo Banco Mundial, con fondos de
# ESMAP. Datos bajo **CC BY 4.0**: uso comercial permitido con atribución. Su
# punto de consulta pública no pide cuenta ni clave.
#
# ⚠️ LA ESCALA DE COLOR NO ES UNIVERSAL: SE AJUSTA AL RECORTE, y es una
# CORRECCIÓN de lo que esta misma sección defendía antes. La rampa fija y ancha
# (3,0 - 7,5) dejaba el mapa de un solo color sobre este corredor —la media del
# año ocupaba el 11 % de la escala— y una capa que no enseña su gradiente no
# informa de nada. Es el mismo arreglo que `99 §ADR-041` le hizo a la capa
# hermana de temperatura y que nunca llegó aquí. Ver `rampa_de_radiacion`.
#
# ⚠️ SE MUESTREA UNA VEZ, AQUÍ, Y SE AUTOHOSPEDA. La aplicación no le pide nada a
# nadie: baja la rejilla ya construida. Y se muestrea GRUESO a propósito —una
# celda cada 2 km sobre un dato de 1 km— porque el recurso solar varía suave: de
# punta a punta del recorte cambia un 7,7 %, así que 2 km sobran para dibujar el
# gradiente y son la sexta parte de peticiones a un servicio ajeno.

ATRIBUCION_GSA = ('Global Solar Atlas 2.0 — Solargis s.r.o. para el Grupo Banco Mundial, '
                  'con fondos de ESMAP (CC BY 4.0)')
GSA_PUNTO = 'https://api.globalsolaratlas.info/data/lta?loc={lat:.5f},{lon:.5f}'
METROS_RADIACION = 2000

# kWh/m² al día. El byte 0 sigue siendo SIN DATO; el paso de 0,03 da más
# resolución de la que tiene el propio dato (~1 %).
RAD_OFFSET, RAD_PASO = 0.0, 0.03

# Los nueve colores de la rampa —frío azul, cálido rojo—. Viven AQUÍ y una sola
# vez: el recurso solar y la temperatura del aire se leen con el mismo ojo, y dos
# listas iguales son dos listas que el día que alguien retoque una discrepan.
COLORES_RAMPA = [
    (49, 54, 149), (69, 117, 180), (171, 217, 233), (255, 245, 190), (254, 224, 144),
    (253, 174, 97), (244, 109, 67), (215, 48, 39), (165, 0, 38),
]


def _rampa_ajustada(minimo, maximo, span_minimo, colores, grano=0.1):
    """
    UNA RAMPA QUE SE AJUSTA AL DATO DEL RECORTE. Dueño único de la mecánica: la
    usan el recurso solar y la temperatura del aire, y tenerla dos veces sería
    tener dos criterios que el día que discrepen pintan escalas distintas.

    `span_minimo` protege el caso del recorte plano DE VERDAD: si toda la serie
    cabe en menos que eso, estirarla dibujaría un degradado que es ruido.
    """
    lo = math.floor(minimo / grano) * grano
    hi = math.ceil(maximo / grano) * grano
    if hi - lo < span_minimo:
        medio = (hi + lo) / 2
        lo, hi = medio - span_minimo / 2, medio + span_minimo / 2
    paso = (hi - lo) / (len(colores) - 1)
    return [(round(lo + i * paso, 2), c) for i, c in enumerate(colores)]


def rampa_de_radiacion(minimo, maximo):
    """
    LA RAMPA DEL SOL SE AJUSTA AL RECORTE, y esto es una CORRECCIÓN de criterio.

    La primera versión usaba una escala FIJA y ancha (3,0 - 7,5 kWh/m² al día)
    «para que dos recortes distintos se pudieran comparar». Medido sobre los
    archivos reales de este recorte: los trece meses caben entre 4,38 y 6,54, o
    sea menos de la mitad de la rampa — y la media del año, que es la capa que se
    abre por defecto, cabe entre 5,19 y 5,67: el 11 % de la escala. El mapa salía
    de un solo color y el Ingeniero no podía apreciar la capa.

    Es exactamente el fallo que `99 §ADR-041` corrigió en la capa hermana de
    temperatura (lección `30 · L-61`): confundir el error ABSOLUTO del modelo
    —común a todas las celdas, que desplaza el mapa entero y no inventa
    gradientes— con el RELATIVO entre celdas vecinas, que es mucho menor y es
    justo lo que se dibuja. Aquella corrección nunca se propagó a esta capa.

    ⚠️ SE CALCULA SOBRE LAS TRECE CAPAS A LA VEZ, nunca por mes. Una escala por
    mes repintaría el mismo color sobre valores distintos y comparar dos meses
    engañaría — que es lo único que la escala fija sí protegía.

    El precio se paga en la leyenda, no callándolo: los extremos van escritos
    para que un rojo intenso no se lea como «sol extremo» cuando lo que dice es
    «dos kilovatios hora más que allá».
    """
    return _rampa_ajustada(minimo, maximo, 0.3, COLORES_RAMPA)

MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
         'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
DIAS_DEL_MES = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]


def malla_de_muestreo(metros_px):
    """
    Los puntos a consultar, repartidos UNIFORMEMENTE EN WEB MERCATOR.

    No en grados: la rejilla que lee la pantalla vive en mercator, y muestrear en
    latitud/longitud la dejaría estirada hacia el norte — el clic diría el valor
    de la celda de al lado.
    """
    ancho, alto, (x0, y0, x1, y1) = tamano_bloque(metros_px)
    puntos = []
    for iy in range(alto):
        for ix in range(ancho):
            x = x0 + (ix + 0.5) * (x1 - x0) / ancho
            y = y1 - (iy + 0.5) * (y1 - y0) / alto
            lon = x * 180 / E
            lat = math.degrees(2 * math.atan(math.exp((y * 180 / E) * math.pi / 180)) - math.pi / 2)
            puntos.append((ix, iy, lat, lon))
    return ancho, alto, puntos


def pedir_gsa(lat, lon, intentos=3):
    """Un punto del atlas solar. Con reintentos: una caída no tira el muestreo entero."""
    req = urllib.request.Request(
        GSA_PUNTO.format(lat=lat, lon=lon),
        headers={'User-Agent': 'mantenimiento-lineas-at (construcción de capa, uso puntual)'})
    for i in range(intentos):
        try:
            with urllib.request.urlopen(req, timeout=45) as r:
                return json.load(r)
        except Exception:                                    # noqa: BLE001
            if i == intentos - 1:
                return None
            time.sleep(1.5 * (i + 1))
    return None


def radiacion(reusar=False):
    ancho, alto, puntos = malla_de_muestreo(METROS_RADIACION)

    # ── Reusar lo ya muestreado ────────────────────────────────────────────
    # El muestreo son 352 peticiones a un servicio de otro. Cambiar la RAMPA no
    # toca ni un valor —las rejillas guardan el BYTE, no el color—, así que
    # volver a pedirlas sería gastar cortesía ajena para nada. Con `--reusar` se
    # leen del disco y solo se rehace la ficha. (Existía para la temperatura y no
    # para el sol: por eso corregir esta escala parecía caro y no lo era.)
    if reusar:
        print('☀️  reusando las rejillas ya muestreadas (no se pide nada a nadie)')
        rejillas = []
        for k in range(13):
            nombre = f'cartagena-radiacion-{"anual" if k == 12 else f"{k + 1:02d}"}.png'
            ruta = os.path.join(SALIDA, nombre)
            if not os.path.exists(ruta):
                sys.exit(f'❌ falta {nombre}: no hay nada que reusar, corra sin --reusar')
            rejillas.append(np.array(Image.open(ruta).convert('L')))
        if rejillas[0].shape != (alto, ancho):
            sys.exit(f'❌ las rejillas del disco miden {rejillas[0].shape} y la malla pide '
                     f'({alto}, {ancho}): el recorte o el paso cambiaron, hay que remuestrear')
        return _publicar_radiacion(rejillas, ancho, alto, len(puntos), 0)

    print(f'☀️  muestreando {len(puntos)} puntos ({ancho}×{alto}, uno cada '
          f'{METROS_RADIACION / 1000:g} km) del Global Solar Atlas…')

    # 13 rejillas: los doce meses y el año. Todas en kWh/m² AL DÍA, que es lo
    # comparable: un mes de 31 días no tiene más sol por ser más largo.
    rejillas = [np.zeros((alto, ancho), dtype=np.uint8) for _ in range(13)]
    fallos = 0
    for n, (ix, iy, lat, lon) in enumerate(puntos):
        if n and n % 40 == 0:
            print(f'   {n}/{len(puntos)}…')
        d = pedir_gsa(lat, lon)
        time.sleep(0.2)                                      # el servicio es de otro
        if not d:
            fallos += 1
            continue
        try:
            mensual = d['monthly']['data']['GHI']
            anual = d['annual']['data']['GHI']
        except (KeyError, TypeError):
            fallos += 1
            continue
        diarios = [mensual[m] / DIAS_DEL_MES[m] for m in range(12)] + [anual / 365.25]
        for k, v in enumerate(diarios):
            b = int(round((v - RAD_OFFSET) / RAD_PASO)) + 1
            rejillas[k][iy, ix] = min(255, max(1, b))

    return _publicar_radiacion(rejillas, ancho, alto, len(puntos), fallos)


def _publicar_radiacion(rejillas, ancho, alto, n_puntos, fallos):
    """De las trece rejillas a los PNG y la ficha. Separado para poder rehacer la
    ficha sin volver a muestrear (`--reusar`)."""
    medidos = int(np.count_nonzero(rejillas[12]))
    if medidos < n_puntos * 0.9:
        sys.exit(f'❌ solo respondieron {medidos} de {n_puntos} puntos: no se publica media capa')

    capas = []
    for k in range(13):
        nombre = f'cartagena-radiacion-{"anual" if k == 12 else f"{k + 1:02d}"}.png'
        Image.fromarray(rejillas[k], 'L').save(os.path.join(SALIDA, nombre), optimize=True)
        v = (rejillas[k][rejillas[k] > 0].astype(np.float32) - 1) * RAD_PASO + RAD_OFFSET
        capas.append({
            'clave': 'anual' if k == 12 else f'{k + 1:02d}',
            'rotulo': 'Media del año' if k == 12 else MESES[k].capitalize(),
            'archivo': nombre,
            'cobertura_pct': round(100 * medidos / n_puntos, 1),
            'resumen': {
                'min': round(float(v.min()), 2), 'p50': round(float(np.median(v)), 2),
                'max': round(float(v.max()), 2),
            },
            'peso_kib': round(os.path.getsize(os.path.join(SALIDA, nombre)) / 1024, 1),
        })
        print(f'   {capas[-1]["rotulo"]:>14}: {capas[-1]["resumen"]["min"]:.2f} … '
              f'{capas[-1]["resumen"]["max"]:.2f} kWh/m² al día')

    # La rampa, del DATO y no de una tabla: mínimo y máximo de las TRECE capas.
    rampa = rampa_de_radiacion(min(c['resumen']['min'] for c in capas),
                               max(c['resumen']['max'] for c in capas))
    print(f'   rampa ajustada al recorte: {rampa[0][0]} … {rampa[-1][0]} kWh/m² al día')

    # LA AMPLITUD ESPACIAL, medida y publicada: es la cifra que explica de cuánto
    # es el gradiente que se ve, para que un color fuerte no se lea como extremo.
    anual_v = (rejillas[12][rejillas[12] > 0].astype(np.float32) - 1) * RAD_PASO + RAD_OFFSET
    amplitud = float(anual_v.max() - anual_v.min())
    meses_p50 = [c['resumen']['p50'] for c in capas[:12]]
    print(f'\n📏 amplitud ESPACIAL de la media anual: {amplitud:.2f} kWh/m² al día · '
          f'oscilación entre MESES: {max(meses_p50) - min(meses_p50):.2f}')
    print(f'✅ 13 capas · {sum(c["peso_kib"] for c in capas):.0f} KiB · {fallos} punto(s) sin respuesta')
    escribir_ficha('radiacion', {
        'capa': 'radiacion',
        'titulo': 'Radiación solar (Global Solar Atlas)',
        # ⚠️ QUÉ ES ESTO, DECLARADO (`99 §ADR-086/087`). El atlas del Caribe
        # obliga a cada capa a decir si es `medida` o `pronostico`, y quien no lo
        # dice se lee como medida. Ésta no es ninguna de las dos: es el PROMEDIO
        # de muchos años, y no tiene fecha que citar. Sin esta palabra, un
        # promedio de treinta años se enseña al lado de un «medido hasta el 23 de
        # agosto» con la misma cara — que es `30 · L-68` otra vez.
        'naturaleza': 'promedio',

        'magnitud': 'GHI — irradiación global horizontal',
        'unidad': 'kWh/m² al día',
        'bbox': list(BBOX),
        'ancho': ancho,
        'alto': alto,
        'resolucion_m': METROS_RADIACION,
        'resolucion_nativa_m': 1000,
        'codificacion': {
            'nota': 'byte 0 = SIN DATO. Con byte v ≥ 1: valor = (v − 1) × paso + offset',
            'offset': RAD_OFFSET, 'paso': RAD_PASO, 'sin_dato': 0,
        },
        'rampa': [{'c': t, 'rgb': list(c)} for t, c in rampa],
        'rampa_ajustada_al_recorte': True,
        'capas': capas,
        # La cifra que explica el gradiente que se ve. Sin ella, un color fuerte
        # se lee como «aquí pega un sol brutal» cuando dice «medio kilovatio hora
        # más que en el otro extremo del recorte».
        'amplitud_espacial': round(amplitud, 2),
        'periodo': 'promedio de largo plazo (no es un día concreto)',
        'fuente': 'Global Solar Atlas 2.0 (Solargis / Banco Mundial / ESMAP), muestreado por punto',
        'licencia': 'CC BY 4.0 — uso comercial permitido con atribución',
        'atribucion': ATRIBUCION_GSA,
        'no_es_irradiancia_instantanea': True,
    })


# ════════════════════════════════════════════════════════════════════════════
# 4 · TEMPERATURA AMBIENTE — la que SÍ entra en el cálculo
#
# Se llama AMBIENTE porque así la nombra la norma (IEEE 738: «ambient
# temperature») y así la nombra quien firma. Es la del AIRE a 2 m: el nombre
# físico y el normativo son la misma medida, y el segundo es el que se entiende.
# ════════════════════════════════════════════════════════════════════════════
#
# POR QUÉ ESTA CAPA Y NO LA DEL SUELO. `ADR-036` publicó la temperatura de la
# SUPERFICIE (Landsat ST_B10) y `ADR-037` la retiró: es lo que miden los tejados
# y el asfalto vistos desde arriba en el instante del paso del satélite, y **no
# entra en ninguna ecuación de este sistema**. La del AIRE sí: es entrada directa
# de la ampacidad (IEEE 738) y es el marco de las cuatro temperaturas de la
# hipótesis —EDS, máxima, mínima y la del estado de viento—, que hoy están
# ADOPTADAS sin una sola fuente local detrás (`TODO-71`).
#
# ⚠️ LAS DOS FRASES QUE IMPIDEN EL MAL USO, y van en la leyenda:
#
#   1. **ES UNA MEDIA DE LARGO PLAZO (1994-2025), NO UN EXTREMO.** La hipótesis
#      de tiro máximo se juega con la MÍNIMA histórica y la ampacidad de diseño
#      con un percentil ALTO; una media no es ni lo uno ni lo otro. Tomar los
#      27 °C de media como «la mínima del sitio» sería peor que no tener el dato:
#      el tiro en frío saldría corto y el apoyo terminal parecería sano.
#   2. **EN ESTE RECORTE EL MAPA ES CASI PLANO.** De punta a punta la media anual
#      cambia 0,4 °C (27,1 → 27,5; verificado por muestreo el 2026-08-20), o sea
#      MENOS que el error del propio modelo. Lo que sí cambia de verdad es el MES
#      —hasta 2,4 °C entre el más fresco y el más cálido en un mismo punto—. Por
#      eso la rampa es FIJA y ancha: estirarla a los 0,4 °C del recorte dibujaría
#      un degradado espectacular que sería ruido amplificado, no información.
#
# ── La fuente y su licencia (la MISMA del recurso solar, verificada 2026-08-20)
# Global Solar Atlas 2.0 — Solargis para el Grupo Banco Mundial (ESMAP), capa
# `TEMP`: temperatura del aire a 2 m, °C, promedio de largo plazo **1994-2025**
# (versión 2.2.67, actualizada 2026-03-01 — lo declara el propio servicio en
# `annual.metadata.layers.TEMP`). **CC BY 4.0**: uso comercial permitido con
# atribución, y su punto de consulta no pide cuenta ni clave. Se muestrea una
# vez, aquí, y se autohospeda: la aplicación no le pide nada a nadie.

METROS_TEMPERATURA = 2000

# °C. El byte 0 sigue siendo SIN DATO. El rango cubre de un páramo colombiano
# (5 °C) al Caribe (35,5 °C) para que dos recortes distintos se puedan comparar
# sin recalibrar nada; el paso de 0,12 °C es más fino que la variación espacial
# de un recorte costero, que es de décimas.
TMP_OFFSET, TMP_PASO = 5.0, 0.12

# Los mismos nueve colores del recurso solar, para que las dos capas se lean con
# el mismo ojo. El nombre se conserva porque lo cita el resto de esta sección.
COLORES_TEMPERATURA = COLORES_RAMPA


def rampa_de_temperatura(minimo, maximo):
    """
    LA RAMPA SE AJUSTA AL DATO, y ésta es una corrección de criterio con nombre.

    La primera versión usaba una escala FIJA y ancha (5-35 °C) para que dos
    recortes se pudieran comparar sin recalibrar. Sobre un corredor costero eso
    dejaba el mapa de un solo color: los 3 °C que separan al punto más fresco del
    más cálido caían dentro de un mismo tramo. Se veía honesto y era inútil — un
    mapa que no enseña su gradiente no informa de nada, y el Ingeniero lo pidió.

    El argumento con el que se defendió la escala fija —«estirarla amplifica el
    ruido»— confundía dos errores distintos: el ABSOLUTO del modelo (±1 °C, que
    afecta a todas las celdas por igual y no inventa gradientes) y el RELATIVO
    entre celdas vecinas del mismo reanálisis, que es mucho menor. El gradiente
    costa-interior que se ve aquí es señal del modelo, no ruido aleatorio.

    ⚠️ SE CALCULA SOBRE LAS TRECE CAPAS A LA VEZ, nunca por mes. Una escala por
    mes repintaría el mismo color sobre temperaturas distintas y comparar dos
    meses engañaría — que es justo el fallo que la escala fija evitaba. Así se ve
    el gradiente del espacio Y el del calendario, con un solo significado de color.

    Y el precio se paga en la leyenda, no callándolo: los extremos van escritos,
    para que un rojo intenso no se lea como «hace un calor extremo» cuando lo que
    dice es «medio grado más que allá».
    """
    return _rampa_ajustada(minimo, maximo, 0.5, COLORES_TEMPERATURA)


def temperatura(reusar=False):
    ancho, alto, puntos = malla_de_muestreo(METROS_TEMPERATURA)

    # ── Reusar lo ya muestreado ────────────────────────────────────────────
    # El muestreo son 352 peticiones a un servicio de otro. Cambiar la RAMPA o
    # cualquier cosa de la ficha no toca ni un valor —las rejillas guardan el
    # BYTE, no el color—, así que volver a pedirlas sería gastar cortesía ajena
    # para nada. Con `--reusar` se leen del disco y solo se rehace la ficha.
    if reusar:
        print('🌡️  reusando las rejillas ya muestreadas (no se pide nada a nadie)')
        rejillas = []
        for k in range(13):
            nombre = f'cartagena-temperatura-{"anual" if k == 12 else f"{k + 1:02d}"}.png'
            ruta = os.path.join(SALIDA, nombre)
            if not os.path.exists(ruta):
                sys.exit(f'❌ falta {nombre}: no hay nada que reusar, corra sin --reusar')
            rejillas.append(np.array(Image.open(ruta).convert('L')))
        if rejillas[0].shape != (alto, ancho):
            sys.exit(f'❌ las rejillas del disco miden {rejillas[0].shape} y la malla pide '
                     f'({alto}, {ancho}): el recorte o el paso cambiaron, hay que remuestrear')
        return _publicar_temperatura(rejillas, ancho, alto, len(puntos), 0)

    print(f'🌡️  muestreando {len(puntos)} puntos ({ancho}×{alto}, uno cada '
          f'{METROS_TEMPERATURA / 1000:g} km) del Global Solar Atlas…')

    # 13 rejillas: los doce meses y la media del año. A diferencia del recurso
    # solar, aquí NO se divide por los días del mes: la temperatura ya es una
    # media, no una cantidad que se acumule.
    rejillas = [np.zeros((alto, ancho), dtype=np.uint8) for _ in range(13)]
    fallos = 0
    for n, (ix, iy, lat, lon) in enumerate(puntos):
        if n and n % 40 == 0:
            print(f'   {n}/{len(puntos)}…')
        d = pedir_gsa(lat, lon)
        time.sleep(0.2)                                      # el servicio es de otro
        if not d:
            fallos += 1
            continue
        try:
            mensual = d['monthly']['data']['TEMP']
            anual = d['annual']['data']['TEMP']
        except (KeyError, TypeError):
            fallos += 1
            continue
        for k, v in enumerate(list(mensual) + [anual]):
            b = int(round((v - TMP_OFFSET) / TMP_PASO)) + 1
            rejillas[k][iy, ix] = min(255, max(1, b))

    return _publicar_temperatura(rejillas, ancho, alto, len(puntos), fallos)


def _publicar_temperatura(rejillas, ancho, alto, n_puntos, fallos):
    """De las trece rejillas a los PNG y la ficha. Separado para poder rehacer la
    ficha sin volver a muestrear (`--reusar`)."""
    medidos = int(np.count_nonzero(rejillas[12]))
    if medidos < n_puntos * 0.9:
        sys.exit(f'❌ solo respondieron {medidos} de {n_puntos} puntos: no se publica media capa')

    capas = []
    for k in range(13):
        nombre = f'cartagena-temperatura-{"anual" if k == 12 else f"{k + 1:02d}"}.png'
        Image.fromarray(rejillas[k], 'L').save(os.path.join(SALIDA, nombre), optimize=True)
        v = (rejillas[k][rejillas[k] > 0].astype(np.float32) - 1) * TMP_PASO + TMP_OFFSET
        capas.append({
            'clave': 'anual' if k == 12 else f'{k + 1:02d}',
            'rotulo': 'Media del año' if k == 12 else MESES[k].capitalize(),
            'archivo': nombre,
            'cobertura_pct': round(100 * medidos / n_puntos, 1),
            'resumen': {
                'min': round(float(v.min()), 2), 'p50': round(float(np.median(v)), 2),
                'max': round(float(v.max()), 2),
            },
            'peso_kib': round(os.path.getsize(os.path.join(SALIDA, nombre)) / 1024, 1),
        })
        print(f'   {capas[-1]["rotulo"]:>14}: {capas[-1]["resumen"]["min"]:.2f} … '
              f'{capas[-1]["resumen"]["max"]:.2f} °C')

    # La rampa, del DATO y no de una tabla: mínimo y máximo de las TRECE capas.
    rampa = rampa_de_temperatura(min(c['resumen']['min'] for c in capas),
                                 max(c['resumen']['max'] for c in capas))
    print(f'   rampa ajustada al recorte: {rampa[0][0]} … {rampa[-1][0]} °C')

    # LA AMPLITUD ESPACIAL, medida y publicada: es la cifra que explica de cuánto
    # es el gradiente que se ve, para que un color fuerte no se lea como un extremo.
    anual_v = (rejillas[12][rejillas[12] > 0].astype(np.float32) - 1) * TMP_PASO + TMP_OFFSET
    amplitud = float(anual_v.max() - anual_v.min())
    meses_p50 = [c['resumen']['p50'] for c in capas[:12]]
    estacional = max(meses_p50) - min(meses_p50)
    print(f'\n📏 amplitud ESPACIAL de la media anual: {amplitud:.2f} °C · '
          f'oscilación entre MESES: {estacional:.2f} °C')
    print(f'✅ 13 capas · {sum(c["peso_kib"] for c in capas):.0f} KiB · {fallos} punto(s) sin respuesta')

    escribir_ficha('temperatura', {
        'capa': 'temperatura',
        'titulo': 'Temperatura ambiente (Global Solar Atlas)',
        # ⚠️ QUÉ ES ESTO, DECLARADO (`99 §ADR-086/087`). El atlas del Caribe
        # obliga a cada capa a decir si es `medida` o `pronostico`, y quien no lo
        # dice se lee como medida. Ésta no es ninguna de las dos: es el PROMEDIO
        # de muchos años, y no tiene fecha que citar. Sin esta palabra, un
        # promedio de treinta años se enseña al lado de un «medido hasta el 23 de
        # agosto» con la misma cara — que es `30 · L-68` otra vez.
        'naturaleza': 'promedio',

        'magnitud': 'TEMP — temperatura ambiente (aire a 2 m)',
        'unidad': '°C',
        'bbox': list(BBOX),
        'ancho': ancho,
        'alto': alto,
        'resolucion_m': METROS_TEMPERATURA,
        'resolucion_nativa_m': 1000,
        'codificacion': {
            'nota': 'byte 0 = SIN DATO. Con byte v ≥ 1: valor = (v − 1) × paso + offset',
            'offset': TMP_OFFSET, 'paso': TMP_PASO, 'sin_dato': 0,
        },
        'rampa': [{'c': t, 'rgb': list(c)} for t, c in rampa],
        'rampa_ajustada_al_recorte': True,
        'capas': capas,
        'periodo': 'promedio de largo plazo 1994-2025 (no es un día concreto)',
        'fuente': 'Global Solar Atlas 2.0 (Solargis / Banco Mundial / ESMAP), capa TEMP, muestreada por punto',
        'licencia': 'CC BY 4.0 — uso comercial permitido con atribución',
        'atribucion': ATRIBUCION_GSA,
        # Las dos verdades que la pantalla tiene que decir, medidas aquí y no
        # supuestas allá: sin ellas, un mapa liso se lee como avería y una media
        # se lee como un extremo.
        'amplitud_espacial_c': round(amplitud, 2),
        'oscilacion_estacional_c': round(estacional, 2),
        'es_media_no_extremo': True,
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
    p.add_argument('capa', choices=['satelital', 'termico', 'radiacion', 'temperatura'])
    p.add_argument('--reusar', action='store_true',
                   help='rehace la ficha desde las rejillas del disco, sin volver a muestrear')
    p.add_argument('--fechas', type=int, default=12,
                   help='cuántas fechas utilizables buscar para el térmico')
    args = p.parse_args()
    os.makedirs(SALIDA, exist_ok=True)
    if args.capa == 'satelital':
        satelital()
    elif args.capa == 'radiacion':
        radiacion(reusar=args.reusar)
    elif args.capa == 'temperatura':
        temperatura(reusar=args.reusar)
    else:
        termico(args.fechas)
