#!/usr/bin/env node
// ============================================================================
// lluvia-caribe.mjs — el atlas de LLUVIA del Caribe, hora a hora
// ----------------------------------------------------------------------------
// Mismo motor y mismos siete departamentos que los otros tres.
//
// ⚠️ EL FACTOR DE 24. En el paso horario NASA publica la precipitación como una
// TASA en mm/día, no como los milímetros de esa hora. El perfil aplica 1/24 y
// está comprobado contra el agregado diario oficial. Sin eso, una hora de 17,5
// se leería como un aguacero cuando en realidad cayeron 0,73 mm.
//
// ⚠️ NO es una medición de pluviómetro y NO sustituye al sondeo del IDEAM, que
// sí es un hecho fechado y sí se guarda (`99 §ADR-020`).
//
// Uso:  node herramientas/lluvia-caribe.mjs [--salida web/public/mapas]
// ============================================================================
import { PERFILES, correr } from './atlas-caribe.mjs';

correr(PERFILES.lluvia);
