#!/usr/bin/env python3
# ============================================================================
# tests/fixtures/construir-sintetico.py — rehace `cargabilidad-sintetico.xlsx`
# ----------------------------------------------------------------------------
# POR QUÉ ESTÁ VERSIONADO. Un fixture binario que nadie sabe reconstruir es un
# fixture que un día no se puede corregir, y del que nadie recuerda qué probaba
# («el fixture que miente», `30`). Esto lo rehace en un segundo y dice, trampa
# por trampa, qué está provocando cada fila.
#
# ⚠️ NI UN DATO DE CLIENTE. Líneas «LN-AAA»/«LN-BBB» y subestaciones de prueba:
# inventadas. Este repo es PÚBLICO (`CLAUDE.md §3.1`).
#
# El XML se escribe A MANO y no con una librería justo porque hace falta OMITIR
# celdas vacías y forzar tipos raros — que es lo que una librería no deja hacer.
#
#   uso:  python3 tests/fixtures/construir-sintetico.py
# ============================================================================
import zipfile, os

SST = ['Fecha', 'Hora', 'Nombre línea', '% Carga', 'Subestación Origen', 'Estado',
       'LN-AAA', 'LN-BBB', 'Normal', 'Alerta & revisión']

esc = lambda t: t.replace('&', '&amp;').replace('<', '&lt;')
shared = ('<?xml version="1.0" encoding="UTF-8"?>'
          f'<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="{len(SST)}" uniqueCount="{len(SST)}">'
          + ''.join(f'<si><t>{esc(t)}</t></si>' for t in SST) + '</sst>')


def c(ref, tipo, valor):
    if tipo == 's':      return f'<c r="{ref}" t="s"><v>{valor}</v></c>'
    if tipo == 'n':      return f'<c r="{ref}"><v>{valor}</v></c>'
    if tipo == 'b':      return f'<c r="{ref}" t="b"><v>{valor}</v></c>'
    if tipo == 'e':      return f'<c r="{ref}" t="e"><v>#N/A</v></c>'
    if tipo == 'inline': return f'<c r="{ref}" t="inlineStr"><is><t>{esc(valor)}</t></is></c>'
    raise ValueError(tipo)


filas = [
    # Fila 1 · cabecera, con tildes y con «%».
    '<row r="1">' + ''.join(c(l + '1', 's', i) for i, l in enumerate('ABCDEF')) + '</row>',

    # Fila 2 · completa. La FECHA va como serial de Excel (45383 = 2024-04-01,
    # contando desde el 30-12-1899) y la HORA como fracción de día (0,5 = 12:00),
    # que es exactamente como las escribe Excel de verdad.
    '<row r="2">' + c('A2', 'n', '45383') + c('B2', 'n', '0.5') + c('C2', 's', '6')
    + c('D2', 'n', '80.5') + c('E2', 'inline', 'SE Norte') + c('F2', 's', '8') + '</row>',

    # Fila 3 · ⚠️ LA TRAMPA PRINCIPAL: la columna B (Hora) NO EXISTE en el XML.
    # Excel omite las celdas vacías. Un lector que vaya por orden correría
    # «LN-BBB» al puesto de Hora y TODA la fila un sitio a la izquierda, sin dar
    # un solo error. La posición sale del atributo `r`, nunca del orden.
    '<row r="3">' + c('A3', 'n', '45383') + c('C3', 's', '7') + c('D3', 'n', '103.2')
    + c('F3', 's', '9') + '</row>',

    # Fila 4 · una celda de ERROR (#N/A) y un BOOLEANO. El #N/A es un hueco, no
    # un cero: si entrara como 0 % hundiría el promedio y diría que la línea
    # estuvo fuera de servicio.
    '<row r="4">' + c('A4', 'n', '45384') + c('B4', 'n', '7') + c('C4', 's', '6')
    + c('D4', 'e', '') + c('F4', 'b', '1') + '</row>',

    # Fila 5 · entera en blanco: no puede llegar como una fila de nulos.
    '<row r="5"></row>',
]

hoja = ('<?xml version="1.0" encoding="UTF-8"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<sheetData>' + ''.join(filas) + '</sheetData></worksheet>')

hoja2 = ('<?xml version="1.0" encoding="UTF-8"?>'
         '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
         '<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>otra cosa</t></is></c></row>'
         '</sheetData></worksheet>')

libro = ('<?xml version="1.0" encoding="UTF-8"?>'
         '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
         'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
         '<sheets><sheet name="Cargabilidad" sheetId="1" r:id="rId1"/>'
         '<sheet name="Notas" sheetId="2" r:id="rId2"/></sheets></workbook>')

rels = ('<?xml version="1.0" encoding="UTF-8"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>'
        '</Relationships>')

ct = ('<?xml version="1.0" encoding="UTF-8"?>'
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      '<Default Extension="xml" ContentType="application/xml"/></Types>')

ruta = os.path.join(os.path.dirname(__file__), 'cargabilidad-sintetico.xlsx')
with zipfile.ZipFile(ruta, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', ct)
    z.writestr('xl/workbook.xml', libro)
    z.writestr('xl/_rels/workbook.xml.rels', rels)
    z.writestr('xl/sharedStrings.xml', shared)
    z.writestr('xl/worksheets/sheet1.xml', hoja)
    # La segunda hoja va SIN COMPRIMIR a propósito: ejercita el método 0 del ZIP,
    # que un lector que solo sepa inflar se saltaría o rompería.
    z.writestr(zipfile.ZipInfo('xl/worksheets/sheet2.xml'), hoja2, zipfile.ZIP_STORED)

print(f'✅ {ruta} · {os.path.getsize(ruta)} bytes')
