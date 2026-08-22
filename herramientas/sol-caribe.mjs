#!/usr/bin/env node
// ============================================================================
// sol-caribe.mjs — el recurso solar del Caribe colombiano, hora a hora
// ----------------------------------------------------------------------------
// EL MOTOR YA NO VIVE AQUÍ. Vive en `atlas-caribe.mjs`, y este archivo solo
// elige el perfil solar. El cambio ocurrió al construir el atlas de temperatura
// (`99 §ADR-053`): la alternativa era copiar 304 renglones y cambiarles un
// parámetro, lo que habría creado un segundo sitio donde arreglar cada fallo —
// incluidos los dos caros que ya se cazaron una vez aquí dentro (el byte 0 que
// NO es un cero medido, y el 200 con HTML que revienta al parsear).
//
// ⚠️ EL NOMBRE Y LA RUTA NO CAMBIAN a propósito: `.github/workflows/vigia-nasa.yml`
// llama a este archivo, y renombrarlo habría dejado al vigía apuntando al vacío
// sin dar error — se habría notado meses después, cuando el atlas dejara de
// actualizarse solo. Cambios ADITIVOS (`CLAUDE.md §3.1`).
//
// QUÉ CONSTRUYE Y POR QUÉ EXISTE. El Ingeniero pidió ver el índice de radiación
// solar «a lo largo de cada día» y «desde inicio del año 2026» en Bolívar,
// Córdoba, Sucre, Cesar, Magdalena, Atlántico y La Guajira. La capa de radiación
// que YA existe no sirve para eso y no es un defecto suyo: cubre 0,29° x 0,38°
// (el corredor de Cartagena), viaja en kWh/m² AL DÍA y son promedios de largo
// plazo por mes. Esto es otra cosa — 6° x 6°, W/m² HORARIOS y días reales de
// 2026 — y por eso es otro producto (`99 §ADR-045`).
//
// ⚠️ LO QUE ESTE DATO ES, Y LO QUE NO ES. NASA publica el horario en `Wh/m²`,
// que en paso de una hora ES LA MEDIA de esa hora. NO es el pico instantáneo:
// el pico dentro de esa hora es por fuerza mayor. Por eso este archivo NO puede
// usarse para bajar los 1.000 W/m² adoptados de la ampacidad (IEEE 738), que son
// una irradiancia INSTANTÁNEA. Medido: el máximo de medias horarias de 2026 en
// la región es 1.027 W/m² y 11 de las 36 celdas superan los 1.000 adoptados.
// Sirve para VER el recurso y para discutir la hipótesis con número; no la cierra.
//
// Uso:  node herramientas/sol-caribe.mjs [--salida web/public/mapas]
// ============================================================================
import { PERFILES, correr } from './atlas-caribe.mjs';

correr(PERFILES.sol);
