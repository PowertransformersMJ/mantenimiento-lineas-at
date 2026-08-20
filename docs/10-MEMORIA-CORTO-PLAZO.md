# 📝 10 — MEMORIA DE CORTO PLAZO (pizarra viva)

> Se **AUTO-CARGA**. Pizarra, no bitácora (§G.3). Tope ~110 líneas / 16k chars.
> **RELEVO 2026-08-20.** Este nodo ES el relevo: léelo entero antes de tocar nada.
> Si contradice a `docs/.handoff-auto.md` (foto real de git), manda ese.

## 🎯 Dónde estamos

**Cifras vivas en `05`.** 12 pestañas + RCA + tres informes. **Mazo E02 listo** (`32 · L-49`). Olas cerradas:
carcasa (ADR-018) · RCA (ADR-020) · documental (ADR-021) · contexto real (ADR-022) · gerencial
(ADR-023) · acceso (ADR-024) · **dato SUPUESTO (ADR-032)** · **capas del mapa: satelital,
recurso solar por mes y pronóstico (ADR-034/035/036/037)**.

## 🛑 LO PRIMERO AL RETOMAR

1. **EL CUELLO DE BOTELLA NO ES CÓDIGO: ES EL DATO.** La ficha estructural se escribe y está EN
   PRODUCCIÓN (`99 §ADR-030`), y desde el 20-08 también **por lote** (`99 §ADR-038`): el dato de
   catálogo entra en los 25 apoyos de un gesto. Siguen **0 de 25 con veredicto** — y el lote **no
   mueve ninguno por sí solo**, comprobado en producción antes de escribir nada: faltan la altura
   libre y la del amarre, que no van por lote (`33 · L-59`). Falta que él conteste `TODO-57`: si esas
   fichas están en planos y actas o hay que levantarlas.
2. **Lo último, 20-08** (detalle en `99 §ADR-038/039/040`): la **pantalla del LOTE** · la
   **temperatura del AIRE** en el mapa —que de paso confirma que la EDS adoptada de 28 °C se
   sostiene: el sitio tiene 27,3— y la **satelital remuestreada** al nivel 15, que era lo que se veía
   borroso. A más resolución **no se puede ir por licencia**, no por técnica (`31 · L-60`, `TODO-72`).
   Las tres verificadas en vivo contra producción con su sesión.
3. **TRES COSAS QUEDARON A MEDIO CAMINO Y SON DE ÉL, no de código:**
   `TODO-57` el dato de la ficha · **ponerse contraseña** (bloquea retirar Google) · `TODO-71` cerrar
   las hipótesis de **viento** y de los **1.000 W/m²** de la ampacidad, que ningún mapa cierra: eso
   es una SERIE histórica con percentiles.
4. **Verificar que una acción FUNCIONÓ**, no solo que se hizo (`TODO-66`): una que no sirvió es hoy
   indistinguible de una que sirvió.
5. **Higiene del cerebro:** lo que el kernel marque al arrancar manda —hoy solo quedan excesos
   leves—. El boot va JUSTO: cada línea nueva en `CLAUDE.md`, `05` o `10` obliga a podar otra.
6. **Las 205 fotos siguen cargadas y visibles** (`99 §ADR-031`), con **tres defectos vivos que no
   bloquean**: el acuse cuenta mal si la foto ya estaba en el depósito · el mapa de carpetas solo se
   entiende como objeto y una lista suelta se ignora en silencio · el guardián de orden salta en
   falso si el mapa no va en orden de recorrido.

## 🚫 INVARIANTES QUE NO SE PUEDEN ROMPER

**Carcasa (`99 §ADR-018`):** `amanecer` es INALCANZABLE si falta un apoyo por dictaminar · la cobertura se cruza POR APOYO, nunca comparando dos conteos · el veredicto se lee de `utilizacion_pct !== null`, **jamás de `cargaRotura_kgf`** · dueños únicos: `vistas/ejesLinea.ts`, `vistas/vanosLinea.ts` y `vistas/coberturaEjes.ts`.

**RCA (`99 §ADR-020`):** PROHIBIDO ranking de hipótesis (ordenar es dictaminar), causa raíz sugerida
por IA, porcentaje de confianza y el estado «no aplica» en una espina · el botón de declarar NO
EXISTE mientras falte una de las SIETE condiciones (7ª: `ADR-026`) · una hipótesis con sustento SOLO
climático la topa el motor en «baja».

**Causa raíz (`99 §ADR-026`):** quién lee las causas es `causasDeclaradas()` del núcleo, **nunca** `a.causaRaiz` a pelo — dos lectores eligiendo por su cuenta enseñan causas distintas del mismo expediente · el molde RECHAZA escribir los dos campos a la vez · una causa `contribuyente` **no promete prevención**, solo cambia la probabilidad.

**Acceso (`99 §ADR-024`):** la pantalla de contraseña es **HIGIENE, no la frontera** — la frontera son las reglas y el rol · quien entra por Google pasa SIEMPRE · la marca se lee `=== true` estricto · ante duda, se deja pasar · el recibo se escribe DESPUÉS del cambio y solo si salió bien.

**Fotos (`99 §ADR-031`):** el portero **NO borra y NO lista**, jamás · se cuelga por **nombre canónico**, nunca por posición · decide la **huella**, no `yaCargado` · nunca se le pregunta a la base si una ficha existe (lo DENIEGA, §ADR-028) · primero el OBJETO, después la FICHA · **el acuse no se borra solo**.

**Recordar ≠ proponer (`99 §ADR-029`):** sin decisión suya el campo se queda VACÍO · **cuál de sus puntos es** y **si lo aprueba** NO se heredan jamás · ningún valor recordado se pinta sin su fecha · se APENDA y **CARGADO manda sobre FIRMADO** · la app solo LEE el libro: quien pueda escribirlo puede fabricar un recuerdo.

**Documentación (`99 §ADR-021/022`):** el verde de `brain:check` dice que el cerebro está bien CONSTRUIDO, **no que diga la verdad** · ninguna cifra se copia fuera de su nodo dueño.

**Capas del mapa (`99 §ADR-034/035/036/037`):** las imágenes viajan CON el sitio —cero teselas de
terceros, y una prueba lo vigila— · una capa de datos se guarda como MEDIDA, nunca como imagen
pintada · el byte 0 es SIN DATO, jamás cero · el pronóstico es lo ÚNICO que necesita internet, NO se
guarda y se pregunta por una celda redondeada · la radiación es ENERGÍA DIARIA y **no se convierte**
en los W/m² instantáneos de la ampacidad.

## 🧭 Cómo retomar

1. **Abrir Claude Code DENTRO de `~/Desktop/GitHub-MJ/mantenimiento-lineas-at/`.** Desde el paraguas
   el gate bloquea el commit: dice «presupuesto de boot excedido» pero es el canario — remedio `node scripts/session-handoff.mjs --boot-echo`.
2. Producción **https://mantenimiento-lineas-at.pages.dev** · repo PÚBLICO → **cero bytes de cliente
   NI DATOS PERSONALES DE NADIE**, ni en pruebas ni en un comentario (`33 · L-23`, `99 §ADR-021`).
3. **Desplegar**: `npm run build && npm run deploy --workspace web`, en ese orden (`32 · L-35`); las
   reglas de Firestore van por SU canal y ANTES que el código (`31 · L-22`).
4. **Verificar contra PRODUCCIÓN con el Chrome del Ingeniero**, preguntando a la pestaña qué bundle
   cargó — nunca contra `dist/` (`32 · L-18/35`). Esperar 5 lecturas iguales al propagar.
5. Antes de CADA push: `npm test` + `contrato:verificar` + `brain:check`. Las **coordenadas ya no se
   buscan a mano**: `githooks/pre-commit` las BLOQUEA antes del cerebro (`30 · L-56`). Todo fallo se
   documenta en su lección ANTES de commitear. Autenticado aquí: `gh`, `wrangler`, `firebase`.

## 🔲 Pendientes del INGENIERO

| # | Qué | Por qué importa |
|---|---|---|
| **NUEVO** | **Ponerse contraseña.** ⚠️ La llave admin ya NO está en Descargas: regenerarla (Consola Firebase → Configuración → Cuentas de servicio → Generar nueva clave) y guardarla FUERA de Descargas. Después: `usuarios.mjs contrasena … --definitiva` (sin `--definitiva` la cuenta queda provisional y se revocan sus sesiones) | Desbloquea retirar Google (fase 2b). Ya está VERIFICADO que la pantalla no le aparece entrando por Google |
| **TODO-57** | **La FICHA ESTRUCTURAL — ya se puede ESCRIBIR, y está EN PRODUCCIÓN** (`99 §ADR-030`). Deja de estar bloqueada por el código: falta **el DATO**. ¿Lo tiene la empresa en planos o actas, o hay que levantarlo? Los seis: carga de rotura · altura libre · altura del amarre · capacidad longitudinal (con **qué ES** ese número) · fases amarradas · tipo de apoyo | **EL CUELLO DE BOTELLA REAL.** Al meter el primero saldrán «REVISAR»: no son averías nuevas, es lo que ya pasaba y no se veía |
| **TODO-69** | **Verificar el pórtico de ORIGEN** de la línea (la carga de agosto quedó cerrada, `99 §ADR-027/028/031`) | Es el único punto de esa carga que nadie ha mirado |
| **TODO-72** | **¿Se puede conseguir autorización del IGAC (o la tiene AFINIA por convenio) para sus ortoimágenes?** Existen y cubren esto: **3 m** en todo Bolívar y **10 cm** en Turbaco, contra los 10 m de Sentinel-2. La licencia publicada las veta para un sitio que las republique (`99 §ADR-040`, `31 · L-60`); el generador YA sabe pedirlas | Es la única vía a más resolución real en el mapa |
| **TODO-71** | **¿Se cierran las hipótesis con dato real?** Ninguna se cierra con un mapa: el **viento** (`ADR-035`) y los **1.000 W/m² adoptados** de la ampacidad, que el recurso solar rodea (`ADR-037`) sin sustituirlos —energía diaria ≠ irradiancia instantánea— | De ahí salen los tiros y la capacidad |
| **TODO-59** | **Qué ficha se le pide a CADA tipología.** La línea mezcla 4 (pórticos de 2 y 3 postes, torre reticulada, poste simple) y el molde es de POSTE (`40 §8.3`) | Son tres o cuatro formularios, no uno |
| **TODO-33** | **50 % o 25 % de RTS** como tope de tiro | Factor 2 sobre un dictamen |
| **TODO-58** | **¿Dónde deben vivir los datos?** Hoy Firestore (São Paulo) y R2 bajo TUS cuentas personales, con coordenadas y fotos del empleador | La región de Firestore es INMUTABLE |
| **TODO-44/34** | Alerta de presupuesto en Cloudflare · respaldo de la bóveda: sus **205 fotos (127 MB) están SIN seguimiento** en `fotos/registro-2026-08/` a propósito —por eso su `git status` sale sucio, no por un pendiente | R2 factura · sin respaldo, la asignación de las 99 fotos deja de ser reproducible |
| **TODO-61/54/68** | ¿App Check? (se enciende en consola, `git revert` no lo deshace) · ¿que el linter vigile la frescura semántica? · ¿que cace un ADR repetido? — el `ADR-023` estuvo duplicado 9 días con todo en verde (`30 · L-47`). Las dos últimas tocan el KERNEL | Las TRES son TUYAS |
| **TODO-03/25/36** | Cronometrar LN-627 · probar descargas y Salir con su sesión | — |

## 🔲 Pendientes de CLAUDE — en este orden

| # | Qué | Dónde está el plan |
|---|---|---|
| **TODO-70** | **Cerrar la ola de la ficha (ADR-030).** ✅ ① 19-08 (`ADR-032`) marca del dato SUPUESTO · ✅ ④ 19-08 (`ADR-033`) el sembrador respeta el cerrojo —falta correrlo contra la base, espera la llave— · ✅ ② **HECHO 20-08** (`ADR-038`): la pantalla del LOTE, verificada en vivo. **Queda SOLO ③: el gesto «Confirmo este dato»**, que exige su propio molde porque `FichaEstructural` rechaza `confirmado_humano` por diseño — confirmar no es un origen, es un acto posterior | `99 §ADR-030/032/033/038` |
| **TODO-66** | **Que una acción pruebe que FUNCIONÓ**, no solo que se hizo. Lo dejó fuera el Ingeniero el 07-08 y queda como deuda declarada en `99 §ADR-026`: bloque de verificación posterior (cuándo, quién, si fue eficaz y cómo se comprobó); la cerrada queda «pendiente de verificar eficacia» hasta esa fecha | `99 §ADR-026` |
| **TODO-50** | **Blindaje**: ✅ F1 · ✅ F2a · ✅ F3 pantalla de cambio · ⬜ **2b retirar Google** — espera la contraseña | `99 §ADR-019/024` |
| **TODO-52** | RCA: solo queda el **lienzo del árbol** (cosmético; en papel la lista sangrada se lee igual) | `99 §ADR-020` |
| **TODO-49/48** | Contador de PARQUE (no construible hoy) · deuda de ADR-017: al veredicto longitudinal le falta el ruido de tendido y el piso de validez | `99 §ADR-017/018` |
| **TODO-30/11 · 13-23** | XSD real de GPX/KML en CI · nota técnica de LN-627 · y F3-F5: invalidación por tramo, sincronización, Firestore vs D1, flujo IA, secretos | crudo de **ADR-013** |

## ✅ Consolidado — el detalle vive en su dueño, no aquí

- **La línea**: 25 estructuras + 3 empalmes, 7 tramos, 3.024 m (`40 §10`). **Hallazgos reales**
  (14 vanos fuera de banda del VIR, 3 apoyos que amplifican, los 2 terminales con el tiro entero):
  `40 §10` y `99 §ADR-013/017`.
- **Callejones ya probados**: índice completo en `30`, y el que más se repite es **«verde no prueba
  nada»** — pruebas (`L-33`), oráculo contaminado (`32 · L-35`), fixture con la forma equivocada
  (`33 · L-53`) y un guardián cuyo resultado no bloquea (`30 · L-56`).
- **IDEAM**: ~11 días de desfase y **rayos sin dato utilizable** (`31 · L-37`).
