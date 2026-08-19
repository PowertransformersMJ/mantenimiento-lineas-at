# 📝 10 — MEMORIA DE CORTO PLAZO (pizarra del trabajo vivo)

> Se **AUTO-CARGA**. Es pizarra, no bitácora (§G.3). Tope ~110 líneas / 16k chars.
> **RELEVO DE SESIÓN 2026-08-19.** Este nodo ES el relevo: léelo entero antes de tocar nada.
> Si contradice a `docs/.handoff-auto.md` (foto real de git), manda ese.

## 🎯 Dónde estamos

**Cifras vivas en `05`.** 12 pestañas + RCA + tres informes. **Mazo de gerencia E02 listo** (`32 · L-49`). Olas cerradas:
carcasa (ADR-018) · RCA (ADR-020) · documental (ADR-021) · contexto real (ADR-022) · gerencial
(ADR-023) · acceso (ADR-024) · **dato SUPUESTO (ADR-032)** · **capas del mapa: imagen, calor
del suelo por fecha y pronóstico (ADR-034/035/036)**.

## 🛑 LO PRIMERO AL RETOMAR

1. **Los puntos de agosto YA ESTÁN cargados** (17-08): 25 estructuras · 3 empalmes · 3.024 m · 7 tramos.
   Y la **ficha estructural ya se puede escribir Y ESTÁ EN PRODUCCIÓN** (`99 §ADR-030`, comprobado
   el 19-08 en el bundle servido): con 3 campos aparece el veredicto de un apoyo. Lo que falta ya no
   es código, es EL DATO — y es pregunta suya (`TODO-57`). Si entra marcado como estimado, **los
   cuatro sitios donde se lee el veredicto lo DICEN** (`ADR-032`).
2. **✅ LAS 205 FOTOS ESTÁN CARGADAS Y SE VEN** (17-08, `99 §ADR-031`), subidas desde la aplicación con su sesión y **sin la llave**. **Tres defectos vivos, ninguno bloquea:** ① el **acuse cuenta mal** si la foto ya estaba en el depósito pero le faltaba la ficha (dice «0 de 7» y entraron 7); ② la pantalla **solo entiende el mapa como objeto** `{carpetas:[…]}` y con una lista suelta —que su propio emparejador acepta— lo ignora EN SILENCIO y dice «carpeta no declarada»; ③ el guardián de orden **salta en falso** si el mapa no va en orden de recorrido (con el empalme en posición 2,5 y E24 en 25 dijo «dos filas cruzadas» sin haberlas). Un guardián que salta cuando no debe se acaba ignorando.
3. **Verificar que una acción FUNCIONÓ**, no solo que se hizo (`TODO-66`): una que no sirvió es hoy indistinguible de una que sirvió.
4. **El tope de tiro sigue sin decidir (TODO-33):** el molde ya trae `tiroAdmisible_pct` y `criterioTiroQueRige` (ADR-014), pero tres vistas leen 0,5·RTS fijo. **TODO-44:** R2 factura.

## 🚫 INVARIANTES QUE NO SE PUEDEN ROMPER

**Carcasa (`99 §ADR-018`):** `amanecer` es INALCANZABLE si falta un apoyo por dictaminar · la cobertura se cruza POR APOYO, nunca comparando dos conteos · el veredicto se lee de `utilizacion_pct !== null`, **jamás de `cargaRotura_kgf`** · dueños únicos: `vistas/ejesLinea.ts`, `vistas/vanosLinea.ts` y `vistas/coberturaEjes.ts`.

**RCA (`99 §ADR-020`):** PROHIBIDO ranking de hipótesis (ordenar es dictaminar), causa raíz sugerida
por IA, porcentaje de confianza, barra de progreso y el estado «no aplica» en una espina · el botón
de declarar NO EXISTE mientras falte una de las SIETE condiciones (7ª: `ADR-026`) · una hipótesis con sustento SOLO
climático la topa el motor en «baja».

**Causa raíz (`99 §ADR-026`):** quién lee las causas es `causasDeclaradas()` del núcleo, **nunca** `a.causaRaiz` a pelo — dos lectores eligiendo por su cuenta enseñan causas distintas del mismo expediente · el molde RECHAZA escribir los dos campos a la vez · una causa `contribuyente` **no promete prevención**, solo cambia la probabilidad.

**Acceso (`99 §ADR-024`):** la pantalla de contraseña es **HIGIENE, no la frontera** — la frontera son las reglas y el rol · quien entra por Google pasa SIEMPRE · la marca se lee `=== true` estricto · ante duda, se deja pasar · el recibo se escribe DESPUÉS del cambio y solo si salió bien.

**Fotos (`99 §ADR-031`):** el portero **NO borra y NO lista**, jamás (guardián por texto) · se cuelga por **nombre canónico**, nunca por posición, y el `id` del apoyo se COPIA de la base · el anti-transposición mira el orden de las **filas del mapa**, nunca el de los archivos · **`yaCargado` NO decide**: decide la **huella** contra lo que ya está · nunca se le pregunta a la base si una ficha existe (eso lo DENIEGA: §ADR-028) · primero el OBJETO, después la FICHA · **el acuse no se borra solo** · el navegador deriva el id de una FOTO y **jamás** el de un punto.

**Recordar ≠ proponer (`99 §ADR-029`):** sin decisión suya el campo se queda VACÍO (veto de ADR-028 entero) · **cuál de sus puntos es** y **si lo aprueba** NO se heredan jamás · ningún valor recordado se pinta sin su fecha · se APENDA, nunca se pisa, y **CARGADO manda sobre FIRMADO** · el libro **no da identidad** y **la app solo lo LEE**: quien pueda escribirlo puede fabricar un recuerdo.

**Documentación (`99 §ADR-021/022`):** el verde de `brain:check` dice que el cerebro está bien CONSTRUIDO, **no que diga la verdad** · ninguna cifra se copia fuera de su nodo dueño · lo que un comité SUPONE entra con el mismo rango que lo verificado.

## 🧭 Cómo retomar

1. **Abrir Claude Code DENTRO de `~/Desktop/GitHub-MJ/mantenimiento-lineas-at/`.** Desde el paraguas
   el gate bloquea el commit: dice «presupuesto de boot excedido» pero es el canario — remedio `node scripts/session-handoff.mjs --boot-echo`.
2. Producción **https://mantenimiento-lineas-at.pages.dev** · repo PÚBLICO → **cero bytes de cliente
   NI DATOS PERSONALES DE NADIE**, ni en pruebas ni en un comentario (`33 · L-23`, `99 §ADR-021`).
3. **Desplegar es `npm run build && npm run deploy --workspace web`**, en ese orden (`32 · L-35`); las **reglas de Firestore van por SU canal y ANTES que el código**: `npx firebase deploy --only firestore:rules --project mantenimiento-lineas-at` (`31 · L-22`).
4. **Verificar contra PRODUCCIÓN con el Chrome del Ingeniero**, preguntando a la pestaña qué bundle
   cargó — nunca contra `dist/` (`32 · L-18/35`). Esperar 5 lecturas iguales al propagar.
5. Antes de CADA push: `npm test` + `contrato:verificar` + `brain:check`, **y buscar coordenadas a
   mano**: `git diff --cached | grep -nE '(^\+.*)(10\.[0-9]{4,}|-7[45]\.[0-9]{4,})'`. Todo fallo se
   documenta en su lección ANTES de commitear. Autenticado aquí: `gh`, `wrangler`, `firebase`.

## 🔲 Pendientes del INGENIERO

| # | Qué | Por qué importa |
|---|---|---|
| **NUEVO** | **Ponerse contraseña.** ⚠️ La llave admin ya NO está en Descargas: regenerarla (Consola Firebase → Configuración → Cuentas de servicio → Generar nueva clave) y guardarla FUERA de Descargas. Después: `usuarios.mjs contrasena … --definitiva` (sin `--definitiva` la cuenta queda provisional y se revocan sus sesiones) | Desbloquea retirar Google (fase 2b). Ya está VERIFICADO que la pantalla no le aparece entrando por Google |
| **TODO-57** | **La FICHA ESTRUCTURAL — ya se puede ESCRIBIR, y está EN PRODUCCIÓN** (`99 §ADR-030`). Deja de estar bloqueada por el código: falta **el DATO**. ¿Lo tiene la empresa en planos o actas, o hay que levantarlo? Los seis: carga de rotura · altura libre · altura del amarre · capacidad longitudinal (con **qué ES** ese número) · fases amarradas · tipo de apoyo | **EL CUELLO DE BOTELLA REAL.** Al meter el primero saldrán «REVISAR»: no son averías nuevas, es lo que ya pasaba y no se veía |
| **TODO-69** | **Verificar el pórtico de ORIGEN** de la línea (la carga de agosto quedó cerrada, `99 §ADR-027/028/031`) | Es el único punto de esa carga que nadie ha mirado |
| **TODO-71** | **¿Se cierra la hipótesis con clima real?** El mapa da el aire PREVISTO (`ADR-035`) y el suelo medido (`ADR-034`), y ninguno vale para calcular: eso se defiende con una SERIE HISTÓRICA y sus percentiles | La hipótesis sigue SIN VALIDAR, y de su viento y su temperatura salen los tiros |
| **TODO-59** | **Qué ficha se le pide a CADA tipología.** La línea mezcla 4 (pórticos de 2 y 3 postes, torre reticulada, poste simple) y el molde es de POSTE (`40 §8.3`) | Son tres o cuatro formularios, no uno |
| **TODO-33** | **50 % o 25 % de RTS** como tope de tiro | Factor 2 sobre un dictamen |
| **TODO-58** | **¿Dónde deben vivir los datos?** Hoy Firestore (São Paulo) y R2 bajo TUS cuentas personales, con coordenadas y fotos del empleador | La región de Firestore es INMUTABLE |
| **TODO-44/34** | Alerta de presupuesto en Cloudflare · respaldo de la bóveda (sin remoto, 337 MB) | R2 factura · sin respaldo, la asignación de las 99 fotos deja de ser reproducible |
| **TODO-61/54/68** | ¿App Check? (se enciende en consola, `git revert` no lo deshace) · ¿que el linter vigile la frescura semántica? · ¿que cace un ADR repetido? — el `ADR-023` estuvo duplicado 9 días con todo en verde (`30 · L-47`). Las dos últimas tocan el KERNEL | Las TRES son TUYAS |
| **TODO-03/25/36** | Cronometrar LN-627 · probar descargas y Salir con su sesión | — |

## 🔲 Pendientes de CLAUDE — en este orden

| # | Qué | Dónde está el plan |
|---|---|---|
| **TODO-70** | **Cerrar la ola de la ficha (ADR-030).** ✅ ① **HECHO 19-08** (`ADR-032`): informe, gerencial, CSV y pantalla marcan el veredicto calculado sobre dato SUPUESTO, y lo decide el MOTOR eje por eje. La marca anterior existía, no disparaba nunca y su prueba la daba por buena (`33 · L-53`). ✅ ④ **HECHO 19-08** (`ADR-033`): el sembrador lee antes de escribir y ya no pisa `revision`, `creadoEn` ni `creadoPor` — falta correrlo contra la base (espera la llave). Queda: ② la pantalla del **LOTE** (la escritura ya existe). ③ El gesto «Confirmo este dato» | `99 §ADR-030/032/033` |
| **TODO-66** | **Que una acción pruebe que FUNCIONÓ**, no solo que se hizo. Lo dejó fuera el Ingeniero el 07-08 y queda como deuda declarada en `99 §ADR-026`: bloque de verificación posterior (cuándo, quién, si fue eficaz y cómo se comprobó); la cerrada queda «pendiente de verificar eficacia» hasta esa fecha | `99 §ADR-026` |
| **TODO-50** | **Blindaje**: ✅ F1 · ✅ F2a · ✅ F3 pantalla de cambio · ⬜ **2b retirar Google** — espera la contraseña | `99 §ADR-019/024` |
| **TODO-52** | RCA: solo queda el **lienzo del árbol** (cosmético; en papel la lista sangrada se lee igual) | `99 §ADR-020` |
| **TODO-49/48** | Contador de PARQUE (no construible hoy) · deuda de ADR-017: al veredicto longitudinal le falta el ruido de tendido y el piso de validez | `99 §ADR-017/018` |
| **TODO-30/11 · 13-23** | XSD real de GPX/KML en CI · nota técnica de LN-627 · y F3-F5: invalidación por tramo, sincronización, Firestore vs D1, flujo IA, secretos | crudo de **ADR-013** |

## ✅ Consolidado (detalle → ADR-001…024)

- **Modelo**: 24 estructuras + 2 empalmes (NO son apoyos), 23 vanos, tramos 1-2-2-14-1-3 (`40 §10`).
- **Hallazgos reales**: 14 de 23 vanos fuera de la banda del VIR · **3 apoyos amplifican** (E06
  ×1,716 = 72 % más) · los 2 terminales soportan el tiro entero (2.339 kgf/conductor) — al sembrar
  la ampliación, el del extremo final pasa a ser el pórtico, no E24.
- **EL HUECO MAYOR**: **0 de 24 apoyos tienen veredicto, en LOS DOS EJES**. El motor YA sabe dictaminar; falta el DATO, y lo cierra `TODO-57`. · Las **205 fotos** están servidas y bien colgadas (ver punto 2).
- **IDEAM**: ~11 días de desfase y **rayos sin dato utilizable** en el Caribe (`31 · L-37`).

## 🚫 Callejones ya probados (índice completo en `30`)

- **Verde no prueba nada**: pruebas (`30 · L-33`), oráculo contaminado (`32 · L-35`), linter del cerebro (`99 §ADR-021`) — que tampoco caza un **ADR repetido** (`30 · L-47`). Agente que muere deja código sin validar (`L-24`); módulo huérfano es invisible (`L-28`); campo del núcleo que nadie consume, igual (`33 · L-45`).
- **Un fixture más completo que la realidad prueba el camino cómodo** (`L-34`) — y uno con la forma EQUIVOCADA blinda una marca que nunca dispara (`33 · L-53`); **un tercer estado que la pantalla aplana se lee como aprobado** (`32 · L-44`).
