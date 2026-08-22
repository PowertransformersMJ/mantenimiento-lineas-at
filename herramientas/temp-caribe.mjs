#!/usr/bin/env node
// ============================================================================
// temp-caribe.mjs — el atlas de TEMPERATURA del aire del Caribe, hora a hora
// ----------------------------------------------------------------------------
// Gemelo del solar, sobre los MISMOS siete departamentos y con el MISMO motor
// (`atlas-caribe.mjs`): aquí solo se elige el perfil. Si algo falla en el
// empaquetado, en la red o en el PNG, se arregla en un sitio y los dos atlas lo
// heredan — que es la razón de que el motor exista (`99 §ADR-053`).
//
// POR QUÉ ESTE ATLAS, en una frase: la ampacidad de la línea la decide el aire.
// La pestaña Térmica trabaja con cuatro escenarios ADOPTADOS —24, 32, 38 y
// 40 °C— y hasta hoy nadie podía contrastarlos contra lo que de verdad pasó en
// la región. Con esto, la pregunta «¿los 32 °C de referencia aguantan?» deja de
// discutirse de memoria.
//
// ⚠️ NO cierra `TODO-71`: son medias horarias sobre celdas de 111 km, no la
// medida del sitio del apoyo. Acerca la conversación; no la termina.
//
// Uso:  node herramientas/temp-caribe.mjs [--salida web/public/mapas]
// ============================================================================
import { PERFILES, correr } from './atlas-caribe.mjs';

correr(PERFILES.temperatura);
