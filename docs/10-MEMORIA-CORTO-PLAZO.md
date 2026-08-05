# 📝 10 — MEMORIA DE CORTO PLAZO (pizarra del trabajo vivo)

> Se **AUTO-CARGA**. Es pizarra, no bitácora (§G.3). Tope ~110 líneas / 16k chars.
> **RELEVO DE SESIÓN 2026-08-04.** Este nodo ES el relevo: léelo entero antes de tocar nada.
> Si contradice a `docs/.handoff-auto.md` (foto real de git), manda ese.

## 🎯 Dónde estamos

**714 pruebas en verde · contrato v0.4.0 · cerebro sano · todo empujado y desplegado.**
11 pestañas + segmento RCA. Producción verificada EN PANTALLA con el Chrome del Ingeniero.

Se cerraron CUATRO olas: **carcasa «El Horizonte»** (ADR-018) · **blindaje de acceso** a medias
(TODO-50 · ADR-019) · **segmento RCA** completo (ADR-020) · **auditoría de documentación**
(ADR-021), que halló 18 huecos **con el linter en verde** y los reparó.

## 🛑 LO PRIMERO AL RETOMAR

1. **DOS COSAS ESPERAN AL INGENIERO Y BLOQUEAN TRABAJO** (detalle en su tabla):
   ponerse contraseña (bloquea retirar Google) y mirar la carcasa/el RCA con ojo de dueño.
2. **El tope de tiro sigue sin decidir (TODO-33).** El contrato ya trae `tiroAdmisible_pct` y
   `criterioTiroQueRige` (ADR-014), pero `vistas/tramos.ts`, `vientoDatos.ts` y `Fundamentos.tsx`
   siguen leyendo `tiroMaximoAdmisible()` = 0,5·RTS fijo — unificarlo al cerrar la decisión.
3. **Alerta de presupuesto en Cloudflare (TODO-44).** R2 no apaga: factura. ~35 MB de 10 GB.

## 🚫 INVARIANTES QUE NO SE PUEDEN ROMPER (lo caro de esta sesión)

**Carcasa (`99 §ADR-018`):** `amanecer` es INALCANZABLE si falta un apoyo por dictaminar (hay prueba
que lo vigila) · la cobertura se cruza POR APOYO, jamás comparando dos conteos · el veredicto se lee
de `utilizacion_pct !== null` —lo que el núcleo concluyó—, **nunca de `cargaRotura_kgf`** · dueños
únicos: `vistas/ejesLinea.ts` (los dos ejes) y `vistas/vanosLinea.ts` (numeración corrida de vanos).

**Documentación (`99 §ADR-021`):** el verde de `brain:check` dice que el cerebro está bien CONSTRUIDO,
**no que diga la verdad**. Y **ninguna cifra se copia fuera de su nodo dueño** — las lecciones las
cuenta `30`, las pruebas `05`: repetida en cuatro sitios, tres estarán mal.

**RCA (`99 §ADR-020`):** PROHIBIDO reintroducir ranking de hipótesis (ordenar es dictaminar), causa
raíz sugerida por IA (un borrador es un ancla), porcentaje de confianza, barra de progreso y el estado
«no aplica» en una espina (el atajo que vacía un Ishikawa) · el botón de declarar la causa NO EXISTE
mientras falte una de las seis condiciones · una hipótesis con sustento SOLO climático la topa el
motor en «baja» · el clima se consulta cuando el Ingeniero lo pide, nunca al pintar.

## 🧭 Cómo retomar

1. **Abrir Claude Code DENTRO de `~/Desktop/GitHub-MJ/mantenimiento-lineas-at/`.** Desde el paraguas
   el gate bloquea el commit por canario de boot (remedio: `node scripts/session-handoff.mjs --boot-echo`;
   el mensaje engaña: dice «presupuesto de boot excedido» cuando es el canario).
2. Producción **https://mantenimiento-lineas-at.pages.dev** · repo PÚBLICO → **cero bytes de cliente
   NI DATOS PERSONALES DE NADIE**, ni en las pruebas ni en un comentario (`33 · L-23`, `99 §ADR-021`).
3. **Desplegar es `npm run build && npm run deploy --workspace web`**, en ese orden: `deploy` NO
   construye y se puede subir un `dist/` rancio (`32 · L-35`). Y las **reglas de Firestore van por
   SU canal**: `npx firebase deploy --only firestore:rules --project mantenimiento-lineas-at`
   (`31 · L-22`, del que `32 · L-36` es la recaída).
4. **Verificar contra PRODUCCIÓN con el Chrome del Ingeniero, preguntándole a la pestaña qué bundle
   cargó** — nunca contra `dist/`, que comparte la causa del fallo (`32 · L-18/35`). Cloudflare sirve
   dos versiones a la vez mientras propaga: esperar 5 lecturas iguales.
5. Antes de CADA push: `npm test` + `contrato:verificar` + `brain:check`, **y buscar coordenadas a
   mano** (no hay comando): `git diff --cached | grep -nE '(^\+.*)(10\.[0-9]{4,}|-7[45]\.[0-9]{4,})'`.
   Todo fallo se documenta en su lección ANTES de commitear. Autenticado en esta Mac: `gh`, `wrangler` (ajimenezp99) y `firebase`; llaves admin en Descargas.

## 🔲 Pendientes del INGENIERO

| # | Qué | Por qué importa |
|---|---|---|
| **NUEVO** | **Ponerse contraseña**: `GOOGLE_APPLICATION_CREDENTIALS=~/Downloads/mantenimiento-lineas-at-firebase-adminsdk-*.json node herramientas/usuarios.mjs contrasena --correo ajimenezp99@gmail.com --definitiva`. **Claude NO puede**: no maneja contraseñas y la herramienta exige teclado real | Sin eso no se puede retirar Google sin dejarlo fuera (TODO-50 fase 2b) |
| **NUEVO** | **Recorrer las 11 familias de `RCA-2026-08-04-0227`** con el expediente delante | La herramienta está probada; que el MÉTODO sirva solo lo dice él usándolo |
| **NUEVO** | **Mirar la carcasa** y decir si el tono del papel y el ancho de columnas van | Ajustarlo ahora es barato |
| **TODO-33** | **Decidir 50 % o 25 % de RTS** como tope de tiro | El motor calcula con 50 % y la doctrina dice 25 %: factor 2 sobre un dictamen |
| **TODO-44** | **Alerta de presupuesto** en Cloudflare (sugerido 1 USD) | R2 no apaga: factura |
| **TODO-34** | **Respaldo de la bóveda**: sin remoto, 337 MB. La única prueba de que `e07` es E06 vive en un HTML de 30 MB en Descargas, sin copia | Sin él, la asignación de las 99 fotos deja de ser reproducible |
| **TODO-02** | Enviar a AFINIA las **7 preguntas** (`99 §ADR-001`) | **ES EL CUELLO DE BOTELLA DE TODO**: la 3 decide si F4 existe; la 4 decide F5/F6; y de ahí sale la ficha estructural que desbloquea los 24 veredictos |
| **TODO-03** | Cronometrar el proceso actual de LN-627 (20 min) | Sin eso el ahorro prometido es inventado |
| **TODO-25** | Probar con su sesión: descargas, Fundamentos, popup, Salir | El clasificador bloquea al usuario de prueba (`30 · L-17`) |
| **TODO-36** | **Fichas editable** (hecho fechado, no sobrescritura): DECISIÓN FUERTE | Mayor hueco de paridad que queda |
| **TODO-54** | **¿Que el linter vigile la frescura semántica?** Propuesta escrita en `99 §ADR-021`, NO aplicada: se toca en `brain-private/kernel/`, afecta al proyecto hermano y obliga a repartir versión. **Es tu decisión, no mía** | Sin ella, que el cerebro diga la verdad depende de que alguien audite a mano — y hoy costó 18 huecos descubrirlo |

## 🔲 Pendientes de CLAUDE — en este orden

| # | Qué | Dónde está el plan |
|---|---|---|
| **TODO-50** | **Blindaje de acceso** (el porqué completo ya está en el ADR, aquí solo lo que falta): ✅ F1 herramienta de alta · ✅ F2a correo+contraseña en producción · ⬜ **2b retirar Google** (espera la contraseña del Ingeniero) · ⬜ 3 pantalla de cambio obligatorio + vistas filtradas por rol · ⬜ 4 rol en el portero + **App Check** | `99 §ADR-019` |
| **TODO-52** | **RCA, lo que falta.** ✅ el camino de edición valida (`ParteDeAnalisis`, strict) · ✅ **acciones CAPA** en colección propia, con motor probado y pantalla — ⚠️ el alta **no se ejercitó contra producción**: no se borran por diseño y no se quiso dejar prueba en el análisis real (tu decisión, 05-08); si tu primera acción falla, dímelo · ⬜ **persistir `SondeoClima`** (hoy la consulta se pierde al recargar) — es REQUISITO del informe, no un adorno · ⬜ **informe del análisis con sus límites impresos** · ⬜ lienzo del árbol | `99 §ADR-020` |
| **TODO-55** | **El vano tri-valuado**: `fueraDeRango: null` (no evaluable) se pinta igual que «dentro de banda». Es la misma falta que TODO-53 en otro sujeto — un hueco disfrazado de dato bueno | `99 §ADR-021` |
| **TODO-56** | **Dos verdades sobre «cerrado»** en el RCA: el booleano `cerrado` y el estado `'cerrado'` del árbol. Hoy no choca porque nada pone `cerrado` en verdadero; hay que reconciliarlo ANTES de que exista un botón de cerrar el análisis | `99 §ADR-021` |
| **TODO-49** | Bloqueantes de la crítica: 3 de 4. Falta el **contador de PARQUE**, no construible hoy | `99 §ADR-018` |
| **TODO-48** | **Deuda de ADR-017**: el criterio del veredicto longitudinal no menciona el ruido de tendido ni el piso de validez; `funcionProcedencia` no viaja a la fila | `99 §ADR-017` |
| **TODO-42/37** | **Informe gerencial** del expediente (10 secciones) · **TODO-30** XSD real de GPX/KML en CI · **TODO-11** nota técnica de LN-627 | crudos de **ADR-012/013** |
| **TODO-13/14/15/16/21/22/23** | F3-F5: invalidación por tramo · sincronización bifurcada · Firestore vs D1 · flujo IA con `ProveedorFalso` · prueba de navegador · secretos de despliegue | — |

## ✅ Consolidado (detalle → ADR-001…021)

- **Modelo**: 24 estructuras + 2 empalmes (NO son apoyos), 23 vanos, tramos 1-2-2-14-1-3 (`40 §10`).
  **Workspaces**: `nucleo/` · `contratos/` **(v0.4.0)** · `exportar/` · `web/` · `evidencias/`.
- **Hallazgos reales**: 14 de 23 vanos fuera de la banda del VIR · **3 apoyos amplifican** (E06 ×1,716
  = 72 % más, con 118,2°) · los 2 terminales soportan el tiro entero (2.339 kgf/conductor).
- **EL HUECO MAYOR, y hay que verlo siempre**: **0 de 24 apoyos tienen veredicto, en LOS DOS EJES**. El
  motor YA sabe dictaminar; falta el DATO — nadie declara `cargaRotura_kgf`, `capacidadLongitudinal` ni
  `nFasesAmarradas`. Es del INVENTARIO y lo cierra `TODO-02`. · **Las 103 fotos se sirven** y cada una
  sabe de quién es; ⚠️ `e07` es **E06** (`99 §ADR-015`).
- **IDEAM verificado 04-08**: CORS abierto, ~11 días de desfase, **rayos sin dato utilizable** en el
  Caribe, y sus tres trampas ya son lección (`31 · L-37`) — no volver a investigarlas.

## 🚫 Callejones ya probados (el índice COMPLETO está en `30`; aquí solo los que más reinciden)

- **Verde no prueba nada**, y hay TRES verdes que engañan: las pruebas (`30 · L-33`), el oráculo que
  comparte la causa del fallo (`32 · L-35`) y el linter del cerebro (`99 §ADR-021`). · Un agente que
  muere deja código SIN VALIDAR, no roto (`30 · L-24`); un módulo que nadie llama es invisible (`L-28`).
- **Afirmar algo que la propia evidencia contradice**: contar una cosa y decir que cuentas otra
  (`99 §ADR-017`) y escribir un motivo que la foto del expediente desmiente (`99 §ADR-020`, final).
