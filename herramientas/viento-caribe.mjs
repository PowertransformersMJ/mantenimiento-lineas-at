#!/usr/bin/env node
// ============================================================================
// viento-caribe.mjs — el atlas de VIENTO del Caribe, hora a hora
// ----------------------------------------------------------------------------
// Mismo motor y mismos siete departamentos que el solar y el de temperatura
// (`atlas-caribe.mjs`): aquí solo se elige el perfil.
//
// ⚠️ NO CIERRA `TODO-71` NI VALIDA LA HIPÓTESIS DE VIENTO. La hipótesis de la
// línea son 100 km/h: un EXTREMO DE DISEÑO con periodo de retorno de decenas de
// años. Esto son medias horarias de UN año sobre celdas de 111 km, y por eso ni
// siquiera se marca esa cifra en la escala — invitar a la comparación sería
// invitar al error caro (`99 §ADR-035` ya lo dejó escrito para el pronóstico).
//
// PARA QUÉ SIRVE DE VERDAD: para leer la región y para decidir la semana. El
// viento es carga sobre la estructura y es seguridad de la cuadrilla.
//
// Uso:  node herramientas/viento-caribe.mjs [--salida web/public/mapas]
// ============================================================================
import { PERFILES, correr } from './atlas-caribe.mjs';

correr(PERFILES.viento);
