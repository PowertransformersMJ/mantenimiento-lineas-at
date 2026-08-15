# 📝 10 — MEMORIA DE CORTO PLAZO (pizarra del trabajo vivo)

> Se **AUTO-CARGA**. Es pizarra, no bitácora (§G.3). Tope ~110 líneas / 16k chars.
> **RELEVO DE SESIÓN 2026-08-06.** Este nodo ES el relevo: léelo entero antes de tocar nada.
> Si contradice a `docs/.handoff-auto.md` (foto real de git), manda ese.

## 🎯 Dónde estamos

**Cifras vivas en `05`.** 11 pestañas + segmento RCA + **tres informes** (línea, RCA, gerencial).
Producción verificada EN PANTALLA con el Chrome del Ingeniero el 06-08.

Olas cerradas: carcasa (ADR-018) · RCA completo (ADR-020) · auditoría documental (ADR-021) · **el
contexto real** (ADR-022: herramienta INTERNA, sin cliente ni contrato) · informe gerencial (ADR-023)
· **la puerta de acceso** (ADR-024).

## 🛑 LO PRIMERO AL RETOMAR

1. **El método RCA quedó al día** (`99 §ADR-025/026`): varias causas raíz, dieciséis familias,
   séptima condición. **Lo que el Ingeniero dejó FUERA a propósito: verificar que una acción
   FUNCIONÓ**, no solo que se hizo (`TODO-66`). Hoy una acción que se ejecutó y no sirvió es
   indistinguible de una que sirvió, y por ahí vuelve la misma falla con un informe cerrado detrás.
2. **El tope de tiro sigue sin decidir (TODO-33).** El contrato ya trae `tiroAdmisible_pct` y
   `criterioTiroQueRige` (ADR-014), pero `vistas/tramos.ts`, `vientoDatos.ts` y `Fundamentos.tsx`
   siguen leyendo `tiroMaximoAdmisible()` = 0,5·RTS fijo — unificarlo al cerrar la decisión.
3. **Alerta de presupuesto en Cloudflare (TODO-44).** R2 no apaga: factura. ~35 MB de 10 GB.

## 🚫 INVARIANTES QUE NO SE PUEDEN ROMPER

**Carcasa (`99 §ADR-018`):** `amanecer` es INALCANZABLE si falta un apoyo por dictaminar · la
cobertura se cruza POR APOYO, nunca comparando dos conteos · el veredicto se lee de
`utilizacion_pct !== null`, **jamás de `cargaRotura_kgf`** · dueños únicos: `vistas/ejesLinea.ts`,
`vistas/vanosLinea.ts` y `vistas/coberturaEjes.ts`.

**RCA (`99 §ADR-020`):** PROHIBIDO ranking de hipótesis (ordenar es dictaminar), causa raíz sugerida
por IA, porcentaje de confianza, barra de progreso y el estado «no aplica» en una espina · el botón
de declarar NO EXISTE mientras falte una de las SIETE condiciones (7ª: `ADR-026`) · una hipótesis con sustento SOLO
climático la topa el motor en «baja».

**Causa raíz (`99 §ADR-026`):** quién lee las causas es `causasDeclaradas()` del núcleo, **nunca**
`a.causaRaiz` a pelo — dos lectores eligiendo por su cuenta acaban enseñando causas distintas del
mismo expediente · el molde RECHAZA escribir los dos campos a la vez · una causa `contribuyente`
**no promete prevención**, solo cambia la probabilidad.

**Acceso (`99 §ADR-024`):** la pantalla de contraseña es **HIGIENE, no la frontera** — la frontera son
las reglas y el rol · quien entra por Google pasa SIEMPRE (cerrojo que no aprovisiona nadie) · la
marca se lee `=== true` estricto · ante cualquier duda, se deja pasar · el recibo se escribe DESPUÉS
del cambio y solo si salió bien.

**Documentación (`99 §ADR-021/022`):** el verde de `brain:check` dice que el cerebro está bien
CONSTRUIDO, **no que diga la verdad** · ninguna cifra se copia fuera de su nodo dueño · y lo que un
comité SUPONE entra con el mismo rango que lo que verifica (`30 · L-42`).

## 🧭 Cómo retomar

1. **Abrir Claude Code DENTRO de `~/Desktop/GitHub-MJ/mantenimiento-lineas-at/`.** Desde el paraguas
   el gate bloquea el commit por canario de boot (remedio: `node scripts/session-handoff.mjs --boot-echo`;
   el mensaje engaña: dice «presupuesto de boot excedido» cuando es el canario).
2. Producción **https://mantenimiento-lineas-at.pages.dev** · repo PÚBLICO → **cero bytes de cliente
   NI DATOS PERSONALES DE NADIE**, ni en pruebas ni en un comentario (`33 · L-23`, `99 §ADR-021`).
3. **Desplegar es `npm run build && npm run deploy --workspace web`**, en ese orden (`32 · L-35`). Y
   las **reglas de Firestore van por SU canal y ANTES que el código**:
   `npx firebase deploy --only firestore:rules --project mantenimiento-lineas-at` (`31 · L-22`).
4. **Verificar contra PRODUCCIÓN con el Chrome del Ingeniero**, preguntando a la pestaña qué bundle
   cargó — nunca contra `dist/` (`32 · L-18/35`). Esperar 5 lecturas iguales al propagar.
5. Antes de CADA push: `npm test` + `contrato:verificar` + `brain:check`, **y buscar coordenadas a
   mano**: `git diff --cached | grep -nE '(^\+.*)(10\.[0-9]{4,}|-7[45]\.[0-9]{4,})'`. Todo fallo se
   documenta en su lección ANTES de commitear. Autenticado aquí: `gh`, `wrangler`, `firebase`.

## 🔲 Pendientes del INGENIERO

| # | Qué | Por qué importa |
|---|---|---|
| **NUEVO** | **Ponerse contraseña.** ⚠️ La llave admin ya NO está en Descargas: regenerarla (Consola Firebase → Configuración → Cuentas de servicio → Generar nueva clave) y guardarla FUERA de Descargas. Después: `GOOGLE_APPLICATION_CREDENTIALS=<llave> node herramientas/usuarios.mjs contrasena --correo ajimenezp99@gmail.com --definitiva`. **Sin `--definitiva` la cuenta queda marcada provisional y se revocan sus sesiones** | Desbloquea retirar Google (fase 2b). Ya está VERIFICADO que la pantalla no le aparece entrando por Google |
| **TODO-57** | **La FICHA ESTRUCTURAL**: carga de rotura, altura libre, altura del punto de sujeción, fases amarradas. ¿Las tiene la empresa en planos o actas, o hay que levantarlas? | **EL CUELLO DE BOTELLA REAL.** Separa «cuánta carga recibe» de «si aguanta» |
| **TODO-59** | **Qué ficha se le pide a CADA tipología.** La línea mezcla 4 (pórticos de 2 y 3 postes, torre reticulada, poste simple) y el modelo del contrato es de POSTE. Evidencia → `40 §8.3` | No es un formulario, son tres o cuatro |
| **TODO-33** | **50 % o 25 % de RTS** como tope de tiro | Factor 2 sobre un dictamen |
| **TODO-58** | **¿Dónde deben vivir los datos?** Hoy Firestore (São Paulo) y R2 bajo TUS cuentas personales, con coordenadas y fotos del empleador | La región de Firestore es INMUTABLE: cambiarla es rehacer |
| **NUEVO** | **Faltan por fotografiar E13–E24.** No es hueco del dato: es recorrido de campo | Sin ellas no hay nada que leer de 12 apoyos |
| **TODO-44/34** | Alerta de presupuesto en Cloudflare · respaldo de la bóveda (sin remoto, 337 MB) | R2 factura · sin respaldo, la asignación de las 99 fotos deja de ser reproducible |
| **TODO-61/54/68** | ¿App Check? (se enciende en consola, `git revert` no lo deshace) · ¿que el linter vigile la frescura semántica? · **`TODO-68`: ¿que el linter cace un número de ADR repetido?** — el `ADR-023` estuvo duplicado 9 días con todo en verde (`30 · L-47`). Las dos últimas tocan el KERNEL y afectan al proyecto hermano | Las TRES son TUYAS, no mías |
| **TODO-03/25/36** | Cronometrar LN-627 · probar descargas y Salir con tu sesión · fichas editables (decisión fuerte) | — |

## 🔲 Pendientes de CLAUDE — en este orden

| # | Qué | Dónde está el plan |
|---|---|---|
| **TODO-67** | ✅ **CERRADO 09-08 y EN PRODUCCIÓN** (`index-BPlGLjn5`). El rótulo de las familias vivía copiado en TRES sitios y uno se quedó en 11: se evaluaban 16 y solo se razonaba sobre 11. Ahora vive en `nucleo/rca.js` junto a `ESPINAS` y los tres consumidores lo leen de ahí. **Con guardián**: 4 pruebas que vigilan la coincidencia (lo que `33 · L-19` pedía y no existía), verificadas por mutación | `33 · L-19` |
| **TODO-66** | **Que una acción pruebe que FUNCIONÓ**, no solo que se hizo. Lo dejó fuera el Ingeniero el 07-08 y queda como deuda declarada en `99 §ADR-026`: bloque de verificación posterior (cuándo, quién, si fue eficaz y cómo se comprobó); la cerrada queda «pendiente de verificar eficacia» hasta esa fecha | `99 §ADR-026` |
| **TODO-50** | **Blindaje**: ✅ F1 · ✅ F2a · ✅ F3 pantalla de cambio · ⬜ **2b retirar Google** — espera la contraseña | `99 §ADR-019/024` |
| **TODO-52** | RCA: solo queda el **lienzo del árbol** (cosmético; en papel la lista sangrada se lee igual) | `99 §ADR-020` |
| **TODO-49/48** | Contador de PARQUE (no construible hoy) · deuda de ADR-017: al veredicto longitudinal le falta declarar el ruido de tendido y el piso de validez | `99 §ADR-017/018` |
| **TODO-30/11 · 13-23** | XSD real de GPX/KML en CI · nota técnica de LN-627 · y F3-F5: invalidación por tramo, sincronización, Firestore vs D1, flujo IA, prueba de navegador, secretos | crudo de **ADR-013** |

## ✅ Consolidado (detalle → ADR-001…024)

- **Modelo**: 24 estructuras + 2 empalmes (NO son apoyos), 23 vanos, tramos 1-2-2-14-1-3 (`40 §10`).
  **Workspaces**: `nucleo/` · `contratos/` **(v0.4.0)** · `exportar/` · `web/` · `evidencias/`.
- **Hallazgos reales**: 14 de 23 vanos fuera de la banda del VIR · **3 apoyos amplifican** (E06 ×1,716
  = 72 % más, con 118,2°) · los 2 terminales soportan el tiro entero (2.339 kgf/conductor).
- **EL HUECO MAYOR**: **0 de 24 apoyos tienen veredicto, en LOS DOS EJES**. El motor YA sabe
  dictaminar; falta el DATO, y lo cierra `TODO-57`. · **103 fotos** se sirven; ⚠️ `e07` es **E06**
  (`99 §ADR-015`) y solo cubren E01–E12.
- **IDEAM**: ~11 días de desfase y **rayos sin dato utilizable** en el Caribe (`31 · L-37`).

## 🚫 Callejones ya probados (índice completo en `30`)

- **Verde no prueba nada**: pruebas (`30 · L-33`), oráculo contaminado (`32 · L-35`), linter del cerebro (`99 §ADR-021`) — que tampoco caza un **ADR con número repetido** (`30 · L-47`).
  Agente que muere deja código sin validar (`L-24`); módulo huérfano es invisible (`L-28`); **campo del núcleo que nadie consume, igual** (`33 · L-45`).
- **Un fixture más completo que la realidad prueba el camino cómodo** (`L-34`); **un tercer estado que la pantalla aplana se lee como aprobado** (`32 · L-44`).
