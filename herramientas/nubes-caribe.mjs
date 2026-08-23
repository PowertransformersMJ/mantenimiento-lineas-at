#!/usr/bin/env node
// ============================================================================
// nubes-caribe.mjs — el atlas de NUBOSIDAD del Caribe, hora a hora
// ----------------------------------------------------------------------------
// Mismo motor y mismos siete departamentos que los otros cuatro
// (`atlas-caribe.mjs`): aquí solo se elige el perfil.
//
// ⚠️ ESTE ATLAS **NO** DICE SI HUBO TORMENTA ELÉCTRICA, y es la advertencia que
// lo acompaña siempre. El aparato eléctrico no se deduce de la nubosidad ni de
// la lluvia, y NASA POWER no publica rayos de ninguna forma. Lo único del
// sistema que habla de tormentas es el PRONÓSTICO, que trae el símbolo de su
// propia fuente (`web/src/vistas/pronostico.ts`).
//
// ⚠️ Y VA CON LATENCIA LARGA. `CLOUD_AMT` sale del mismo producto que la
// radiación (CERES SYN1deg) y se publica meses por detrás de temperatura,
// viento y lluvia: comprobado el 2026-08-22, había horas hasta finales de mayo
// y de junio en adelante nada. El vigía semanal lo irá completando solo.
//
// Uso:  node herramientas/nubes-caribe.mjs [--salida web/public/mapas]
// ============================================================================
import { PERFILES, correr } from './atlas-caribe.mjs';

correr(PERFILES.nubes);
