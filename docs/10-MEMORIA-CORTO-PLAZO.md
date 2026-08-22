# 📝 10 — MEMORIA DE CORTO PLAZO (pizarra viva)

> Se **AUTO-CARGA**. Pizarra, no bitácora (§G.3). Tope ~110 líneas / 16k chars.
> **RELEVO 2026-08-21.** Este nodo ES el relevo: léelo entero. Si contradice a
> `docs/.handoff-auto.md` (foto real de git), manda ese.

## 🎯 Dónde estamos

**Cifras vivas en `05`.** 14 pestañas + RCA + tres informes. **Mazo E02 listo** (`32 · L-49`).
Olas cerradas: ADR-018 · 020-024 · **032** · **034-037 y 039-042** (las capas del mapa) · **043**
(satelital) · **044** (cable de guarda) · **045** (atlas solar, `#/sol`) · **046** (la capa de
radiación por fin se APRECIA). Las cuatro del 21-08 están EN PRODUCCIÓN y verificadas en vivo.

## 🛑 LO PRIMERO AL RETOMAR

1. **EL CUELLO DE BOTELLA NO ES CÓDIGO: ES EL DATO.** La ficha estructural se escribe y está EN
   PRODUCCIÓN (`99 §ADR-030`), y desde el 20-08 también **por lote** (`99 §ADR-038`): el dato de
   catálogo entra en los 25 apoyos de un gesto. Siguen **0 de 25 con veredicto** — y el lote **no
   mueve ninguno por sí solo**, comprobado en producción antes de escribir nada: faltan la altura
   libre y la del amarre, que no van por lote (`33 · L-59`). Falta que él conteste `TODO-57`: si esas
   fichas están en planos y actas o hay que levantarlas.
2. **LO ÚLTIMO — `ADR-046`, y lo encontró ÉL:** «la capa de radiación... no puedo apreciarla en la
   página». No estaba rota —se pintaba, respondía al clic, todo en verde—: le faltaban las DOS
   correcciones que ya se habían pagado en la capa hermana de temperatura y que nunca cruzaron —el
   botón «Ver todo el recorte» (`ADR-042`) y la rampa ajustada al dato (`ADR-041`)—. Encuadrada en
   los 3 km de la línea salía de un color. Ya está en producción, con guardián que recorre las DOS
   capas. **Lección `32 · L-65`: una corrección es deuda con toda la familia, no con el módulo donde
   se descubrió.** Antes, ese mismo día:
   `ADR-043` la sonda del mapa · `ADR-044` cable de guarda, 24/24 vanos declarados · `ADR-045` atlas
   solar en `#/sol`, auditado con Fable. Los tres ENTEROS en `99`; aquí no se copian.
   ⚠️ `31 · L-60` (licencia de las ortos del IGAC) **puede estar MAL** y sigue sin confirmar: un
   agente sostiene que las del Catastro Distrital sí son redistribuibles. Verificar ANTES de citarlo.
3. **TRES SON DE ÉL, no de código** (detalle en su tabla): `TODO-57` el dato de la ficha ·
   **ponerse contraseña** (bloquea retirar Google) · `TODO-71` viento y los 1.000 W/m².
4. **Verificar que una acción FUNCIONÓ**, no solo que se hizo (`TODO-66`).
5. **Higiene del cerebro — mantenimiento integral hecho el 21-08 (`99 §ADR-047`).** Auditoría de
   6 lentes con refutador: **28 huecos confirmados y cerrados**, 15 tumbados. El nodo del MAPA se
   partió a `docs/34` y todas las neuronas caben en su tope. Lo consolidado se MOVIÓ a su dueño,
   nunca se borró. Regla que sigue: cada línea nueva en `CLAUDE.md`, `05` o `10` poda otra.
6. **Las 205 fotos siguen cargadas y visibles** (`99 §ADR-031`), con **tres defectos vivos que no
   bloquean**: acuse que cuenta mal, mapa de carpetas solo como objeto, orden con falso positivo.

## 🚫 INVARIANTES QUE NO SE PUEDEN ROMPER

No se resumen aquí: cada uno vive ENTERO en su ADR y copiarlos crea una segunda versión que se
desincroniza. Léelos antes de tocar su subsistema.

· **Carcasa** `§ADR-018` — `amanecer` inalcanzable si falta un apoyo; el veredicto se lee de
  `utilizacion_pct`, jamás de `cargaRotura_kgf`; dueños únicos en `vistas/`.
· **RCA** `§ADR-020` — prohibido ranking de hipótesis, causa raíz por IA y porcentaje de confianza.
· **Causa raíz** `§ADR-026` — quién lee las causas es `causasDeclaradas()`, nunca `a.causaRaiz`.
· **Acceso** `§ADR-024` — la contraseña es HIGIENE, no la frontera; la frontera son las reglas.
· **Fotos** `§ADR-031` — el portero NO borra y NO lista; se cuelga por nombre canónico; decide la huella.
· **Recordar ≠ proponer** `§ADR-029` — sin decisión suya el campo queda VACÍO.
· **Capas del mapa** `§ADR-034/037/046` — las imágenes viajan CON el sitio; una capa de datos se
  guarda como MEDIDA, nunca como imagen; el byte 0 es SIN DATO; el pronóstico no se guarda jamás; y
  toda capa de medida trae encuadre al recorte Y escala publicada, las DOS o ninguna.
· **Ficha y lote** `§ADR-030/038` — el lote solo rellena huecos y solo con los tres campos del MODELO.
· **Documentación** `§ADR-021` — el verde de `brain:check` dice que está bien CONSTRUIDO, no que
  diga la verdad.

## 🧭 Cómo retomar

1. **Abrir Claude Code DENTRO del proyecto** — desde el paraguas el gate bloquea el commit
   (remedio: `node scripts/session-handoff.mjs --boot-echo`).
2. Producción **https://mantenimiento-lineas-at.pages.dev** · repo PÚBLICO → **cero bytes de cliente**
   (`33 · L-23`). Desplegar: `npm run build && npm run deploy --workspace web`, en ese orden
   (`32 · L-35`); reglas de Firestore por SU canal y ANTES (`31 · L-22`).
3. **Verificar contra PRODUCCIÓN con el Chrome del Ingeniero**, nunca contra `dist/` (`32 · L-18/35`).
   Para el MAPA ya no hace falta su navegador: `SONDA_MAPA=1 npm run build` + `sonda-satelital.html`
   monta el componente real sin sesión, y `__mapas.ver()` lo mide por instancia (`32 · L-63`).
4. Antes de CADA push: `npm test` + `contrato:verificar` + `brain:check`. Autenticados: `gh`,
   `wrangler`, `firebase`.

## 🔲 Pendientes del INGENIERO

| # | Qué | Por qué importa |
|---|---|---|
| **NUEVO** | **Ponerse contraseña.** ⚠️ La llave admin ya NO está en Descargas: regenerarla (Consola Firebase → Configuración → Cuentas de servicio → Generar nueva clave) y guardarla FUERA de Descargas. Después: `usuarios.mjs contrasena … --definitiva` (sin `--definitiva` la cuenta queda provisional y se revocan sus sesiones) | Desbloquea retirar Google (fase 2b). Ya está VERIFICADO que la pantalla no le aparece entrando por Google |
| **TODO-57** | **La FICHA ESTRUCTURAL — ya se puede ESCRIBIR, y está EN PRODUCCIÓN** (`99 §ADR-030`). Deja de estar bloqueada por el código: falta **el DATO**. ¿Lo tiene la empresa en planos o actas, o hay que levantarlo? Los seis: carga de rotura · altura libre · altura del amarre · capacidad longitudinal (con **qué ES** ese número) · fases amarradas · tipo de apoyo | **EL CUELLO DE BOTELLA REAL.** Al meter el primero saldrán «REVISAR»: no son averías nuevas, es lo que ya pasaba y no se veía |
| **TODO-75** | **Dos ajustes de GitHub, o el vigía del atlas solar no sirve** (`99 §ADR-045`). Verificado con `gh`: el token por defecto es de SOLO LECTURA y `main` NO está protegida (404 «Branch not protected»). ① Settings → Actions → General → permitir que Actions **cree** propuestas. ② Proteger `main` exigiendo el CI — un PR abierto por el robot NO dispara `ci.yml`, así que llegaría sin un solo check | Sin los dos, el vigía o no abre nada o abre algo que nadie ha revisado. Primer disparo: 3-ene |
| **TODO-69** | **Verificar el pórtico de ORIGEN** de la línea (la carga de agosto quedó cerrada, `99 §ADR-027/028/031`) | Es el único punto de esa carga que nadie ha mirado |
| **TODO-72** | **¿Se puede conseguir autorización del IGAC (o la tiene AFINIA por convenio) para sus ortoimágenes?** Existen y cubren esto: **3 m** en todo Bolívar y **10 cm** en Turbaco, contra los 10 m de Sentinel-2. La licencia publicada las veta para un sitio que las republique (`99 §ADR-040`, `31 · L-60`); el generador YA sabe pedirlas | Es la única vía a más resolución real en el mapa |
| **TODO-71** | **¿Se cierran las hipótesis con dato real?** Ninguna se cierra con un mapa: el **viento** (`ADR-035`) y los **1.000 W/m² adoptados** de la ampacidad, que el recurso solar rodea (`ADR-037`) sin sustituirlos —energía diaria ≠ irradiancia instantánea— | De ahí salen los tiros y la capacidad |
| **TODO-59** | **Qué ficha se le pide a CADA tipología.** La línea mezcla 4 (pórticos de 2 y 3 postes, torre reticulada, poste simple) y el molde es de POSTE (`40 §8.3`) | Son tres o cuatro formularios, no uno |
| **TODO-33** | **50 % o 25 % de RTS** como tope de tiro | Factor 2 sobre un dictamen |
| **TODO-58** | **¿Dónde deben vivir los datos?** Hoy Firestore (São Paulo) y R2 bajo TUS cuentas personales, con coordenadas y fotos del empleador | La región de Firestore es INMUTABLE |
| **TODO-44/34** | Alerta de presupuesto en Cloudflare · **respaldo FUERA de esta Mac**: las 205 fotos (127 MB) **ya están versionadas** en la bóveda desde el 21-08, pero `brain-private` **no tiene remoto** (decisión de ecosistema, ADR-059) | R2 factura · un fallo de disco se lleva la bóveda entera, no solo las fotos |
| **TODO-61/54/68** | ¿App Check? (se enciende en consola, `git revert` no lo deshace) · ¿que el linter vigile la frescura semántica? · ¿que cace un ADR repetido? — el `ADR-023` estuvo duplicado 9 días con todo en verde (`30 · L-47`). Las dos últimas tocan el KERNEL | Las TRES son TUYAS |
| **TODO-76** | **¿Se guarda que un apoyo es autosoportado / retenido?** Usted declaró que NINGUNO de LN-627 lleva retenida (`40 §Dato de campo`). Hoy **no cabe en el modelo**: iría por APOYO (25 declaraciones), nunca por línea. ¿Campo `tieneRetenida` sí/no, o «configuración» más ancha? | Cierra media incógnita de la capacidad longitudinal; la otra media —la sección— sigue abierta |
| **TODO-03/25/36** | Cronometrar LN-627 · probar descargas y Salir con su sesión | — |

## 🔲 Pendientes de CLAUDE — en este orden

| # | Qué | Dónde está el plan |
|---|---|---|
| **TODO-70** | **Cerrar la ola de la ficha (ADR-030).** ✅ ① 19-08 (`ADR-032`) marca del dato SUPUESTO · ✅ ④ 19-08 (`ADR-033`) el sembrador respeta el cerrojo —falta correrlo contra la base, espera la llave— · ✅ ② **HECHO 20-08** (`ADR-038`): la pantalla del LOTE, verificada en vivo. **Queda SOLO ③: el gesto «Confirmo este dato»**, que exige su propio molde porque `FichaEstructural` rechaza `confirmado_humano` por diseño — confirmar no es un origen, es un acto posterior | `99 §ADR-030/032/033/038` |
| **TODO-66** | **Que una acción pruebe que FUNCIONÓ**, no solo que se hizo. Lo dejó fuera el Ingeniero el 07-08 y queda como deuda declarada en `99 §ADR-026`: bloque de verificación posterior (cuándo, quién, si fue eficaz y cómo se comprobó); la cerrada queda «pendiente de verificar eficacia» hasta esa fecha | `99 §ADR-026` |
| **TODO-50** | **Blindaje**: ✅ F1 · ✅ F2a · ✅ F3 pantalla de cambio · ⬜ **2b retirar Google** — espera la contraseña | `99 §ADR-019/024` |
| **TODO-52/49/48** | RCA: el **lienzo del árbol** (cosmético) · contador de PARQUE (no construible hoy) · deuda de ADR-017: al veredicto longitudinal le falta el ruido de tendido y el piso de validez | `99 §ADR-017/018/020` |
| **TODO-77** | **Triar los 51 hallazgos de la auditoría del entorno (09-08)**: unos ya se cerraron sin dejar rastro documental y de otros nadie sabe; el crudo no puede decir qué queda | crudo `2026-08-09-plan-entorno.md` |
| **TODO-30/11 · 13-23** | XSD real de GPX/KML en CI · nota técnica de LN-627 · y F3-F5: invalidación por tramo, sincronización, Firestore vs D1, flujo IA, secretos | crudo de **ADR-013** |

## ✅ Consolidado — el detalle vive en su dueño, no aquí

- **La línea** (25 estructuras + 3 empalmes, 7 tramos, 3.024 m) y sus hallazgos reales —14 vanos
  fuera de banda del VIR, 3 apoyos que amplifican, 2 terminales con el tiro entero— → `40 §10` y
  `99 §ADR-013/017`. **IDEAM**: ~11 días de desfase, rayos sin dato utilizable (`31 · L-37`).
- **Callejones ya probados**: índice completo en `30`; el que más se repite es **«verde no prueba nada»** (`L-33` · `32 · L-35` · `33 · L-53` · `30 · L-56`).
