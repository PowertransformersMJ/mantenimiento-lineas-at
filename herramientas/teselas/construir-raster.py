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

def leer_bloque(url, bandas, resolucion_z):
    """
    La zona del recorte, ya en Web Mercator y a la resolución del zoom máximo.

    Se lee de UNA vez y no tesela a tesela: cada lectura por `/vsicurl` es una
    petición de rango a un servidor al otro lado del mundo, y trocearla en 250
    peticiones convierte un minuto en media hora.
    """
    x0, y0 = a_mercator(BBOX[0], BBOX[1])
    x1, y1 = a_mercator(BBOX[2], BBOX[3])
    metros_px = 2 * E / (2 ** resolucion_z * TESELA)
    ancho = int(round((x1 - x0) / metros_px))
    alto = int(round((y1 - y0) / metros_px))

    print(f'   leyendo {ancho}×{alto} px desde la escena…')
    with rasterio.open(url) as src:
        with WarpedVRT(src, crs='EPSG:3857', resampling=Resampling.bilinear) as vrt:
            ventana = from_bounds(x0, y0, x1, y1, vrt.transform)
            datos = vrt.read(bandas, window=ventana, out_shape=(len(bandas), alto, ancho),
                             resampling=Resampling.bilinear)
    return datos, (x0, y0, x1, y1)


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
    datos, limites = leer_bloque('/vsicurl/' + escena['url'], [1, 2, 3], Z_MAX)

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
        t.save(buf, format='WEBP', quality=82, method=4)
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
# convierte a kelvin con esta escala y este desplazamiento. No es un ajuste.
ST_ESCALA, ST_DESPLAZAMIENTO = 0.00341802, 149.0

# La rampa. Se elige DIVERGENTE y con anclas fijas en °C, no estirada al máximo
# y al mínimo de la escena: una rampa que se reescala sola hace que dos mapas de
# días distintos pinten el mismo color sobre temperaturas distintas, y entonces
# comparar dos fechas engaña. Los cortes van en la leyenda, escritos.
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


# El paso de la escala. NO es un detalle de compresión: la temperatura de
# superficie de Landsat trae una incertidumbre del orden de 1-2 K, así que una
# rampa continua enseñaría décimas que el sensor no tiene. Se pinta en escalones
# de 1 °C — más honesto Y, de regalo, un PNG con 40 colores en vez de 4.000.
PASO_C = 1.0


def colorear(celsius, valido):
    """°C → RGBA con la rampa fija, en escalones de 1 °C. Sin dato = transparente."""
    alto, ancho = celsius.shape
    rgba = np.zeros((alto, ancho, 4), dtype=np.uint8)
    topes = np.array([t for t, _ in RAMPA], dtype=np.float32)
    colores = np.array([c for _, c in RAMPA], dtype=np.float32)
    x = np.clip(np.round(celsius / PASO_C) * PASO_C, topes[0], topes[-1])
    for canal in range(3):
        rgba[:, :, canal] = np.interp(x, topes, colores[:, canal]).astype(np.uint8)
    rgba[:, :, 3] = np.where(valido, 255, 0)
    return rgba


def buscar_landsat(meses=12):
    desde = (datetime.now(timezone.utc) - timedelta(days=30 * meses)).strftime('%Y-%m-%dT00:00:00Z')
    cuerpo = json.dumps({
        'collections': ['landsat-c2-l2'],
        'bbox': list(BBOX),
        'datetime': f'{desde}/..',
        'query': {'eo:cloud_cover': {'lt': 5},
                  'platform': {'in': ['landsat-8', 'landsat-9']}},
        'limit': 30,
        'sortby': [{'field': 'properties.eo:cloud_cover', 'direction': 'asc'}],
    }).encode()
    req = urllib.request.Request('https://planetarycomputer.microsoft.com/api/stac/v1/search',
                                 data=cuerpo, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=90) as r:
        d = json.load(r)
    if not d.get('features'):
        sys.exit('❌ ninguna escena Landsat con menos del 5 % de nubes sobre el recorte')
    f = la_mas_reciente_despejada(d['features'])
    with urllib.request.urlopen(
            'https://planetarycomputer.microsoft.com/api/sas/v1/token/landsat-c2-l2',
            timeout=60) as r:
        testigo = json.load(r)['token']
    return {
        'id': f['id'],
        'fecha': f['properties']['datetime'],
        'nubes_pct': f['properties'].get('eo:cloud_cover'),
        'plataforma': f['properties'].get('platform'),
        'url': f['assets']['lwir11']['href'].split('?')[0] + '?' + testigo,
    }


def termico():
    escena = buscar_landsat()
    print(f"🌡️  Landsat {escena['id']} · {escena['fecha'][:10]} · "
          f"{escena['nubes_pct']:.2f} % de nubes")
    datos, limites = leer_bloque('/vsicurl/' + escena['url'], [1], Z_MAX)

    bruto = datos[0].astype(np.float32)
    valido = bruto > 0                      # 0 es «sin dato», no 0 K
    kelvin = bruto * ST_ESCALA + ST_DESPLAZAMIENTO
    celsius = kelvin - 273.15
    medidos = celsius[valido]
    if medidos.size == 0:
        sys.exit('❌ la escena no dejó un solo píxel válido sobre el recorte')

    resumen = {
        'min_c': float(np.min(medidos)), 'max_c': float(np.max(medidos)),
        'p05_c': float(np.percentile(medidos, 5)), 'p50_c': float(np.percentile(medidos, 50)),
        'p95_c': float(np.percentile(medidos, 95)),
        'cobertura_pct': float(100 * valido.mean()),
    }
    print('   °C sobre el recorte — mín {min_c:.1f} · p05 {p05_c:.1f} · mediana {p50_c:.1f}'
          ' · p95 {p95_c:.1f} · máx {max_c:.1f}'.format(**resumen))

    imagen = Image.fromarray(colorear(celsius, valido), 'RGBA')

    def guardar(t):
        if t.getchannel('A').getextrema()[1] == 0:
            return None
        buf = BytesIO()
        # PNG con PALETA: la imagen tiene ~40 colores (uno por escalón de °C) y
        # guardarla en color verdadero multiplicaba por cinco el peso del archivo
        # sin añadir ni un grado de información.
        t.quantize(colors=64, method=Image.Quantize.FASTOCTREE).save(
            buf, format='PNG', optimize=True)
        return buf.getvalue()

    teselas = generar(imagen, limites, guardar)
    mb = os.path.join(SALIDA, 'cartagena-termico.mbtiles')
    escribir_mbtiles(
        mb, teselas, 'png', 'Temperatura de la superficie (Landsat)',
        'USGS Landsat Collection 2 Level-2 — dominio público',
        f"Landsat {escena['id']} · {escena['fecha'][:10]} · temperatura de SUPERFICIE, no del aire")
    mib = empaquetar(mb, os.path.join(SALIDA, 'cartagena-termico.pmtiles'))

    escribir_ficha('termico', {
        'capa': 'termico',
        'titulo': 'Temperatura de la superficie (Landsat)',
        'escena': escena['id'],
        'plataforma': escena['plataforma'],
        'fecha': escena['fecha'],
        'nubes_pct': round(escena['nubes_pct'], 2),
        'resolucion_m': 30,
        'resolucion_nativa_m': 100,
        'paso_c': PASO_C,
        'rampa': [{'c': t, 'rgb': list(c)} for t, c in RAMPA],
        'resumen_c': {k: round(v, 1) for k, v in resumen.items()},
        'fuente': 'USGS Landsat Collection 2 Level-2, banda ST_B10 · copia abierta en '
                  'Microsoft Planetary Computer',
        'licencia': 'USGS: dominio público, sin restricción de uso',
        'atribucion': 'USGS Landsat Collection 2 Level-2',
        'es_superficie_no_aire': True,
        'peso_mib': round(mib, 1),
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
    args = p.parse_args()
    os.makedirs(SALIDA, exist_ok=True)
    (satelital if args.capa == 'satelital' else termico)()
