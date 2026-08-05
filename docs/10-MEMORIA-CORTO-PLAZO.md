# 📝 10 — MEMORIA DE CORTO PLAZO (pizarra del trabajo vivo)

> Se **AUTO-CARGA**. Es pizarra, no bitácora (§G.3). Tope ~110 líneas / 16k chars.
> **RELEVO DE SESIÓN 2026-08-04 (segunda)** — la conversación llegó al tope de contexto.
> Este nodo ES el relevo: léelo entero antes de tocar nada. Si contradice a
> `docs/.handoff-auto.md` (foto real de git), manda ese.

## 🎯 Dónde estamos

**714 pruebas en verde · contrato v0.4.0 · cerebro sano · todo empujado y desplegado.**
11 pestañas + segmento RCA. Producción verificada EN PANTALLA con el Chrome del Ingeniero.

En esta sesión se cerraron TRES olas: la **carcasa «El Horizonte»** (ADR-018), el **blindaje de
acceso** (a medias, ver TODO-50) y el **segmento RCA** completo (ADR-020).

## 🛑 LO PRIMERO AL RETOMAR

1. **DOS COSAS ESPERAN AL INGENIERO Y BLOQUEAN TRABAJO** (detalle en su tabla):
   ponerse contraseña (bloquea retirar Google) y mirar la carcasa/el RCA con ojo de dueño.
2. **El tope de tiro sigue sin decidir (TODO-33).** Único bloqueo original que queda. Desde ADR-014
   `tiroAdmisible_pct` y `criterioTiroQueRige` YA existen en el contrato. Ojo: `vistas/tramos.ts`,
   `vientoDatos.ts` y `Fundamentos.tsx` siguen leyendo `tiroMaximoAdmisible()` = 0,5·RTS fijo en
   código — unificarlo al cerrar la decisión.
3. **Alerta de presupuesto en Cloudflare (TODO-44).** R2 no apaga: factura. ~35 MB de 10 GB.

## 🚫 INVARIANTES QUE NO SE PUEDEN ROMPER (lo caro de esta sesión)

**Carcasa (`99 §ADR-018`):** `amanecer` es INALCANZABLE si falta un apoyo por dictaminar (hay prueba
que lo vigila) · la cobertura se cruza POR APOYO, jamás comparando dos conteos · el veredicto se lee
de `utilizacion_pct !== null` —lo que el núcleo concluyó—, **nunca de `cargaRotura_kgf`** · dueños
únicos: `vistas/ejesLinea.ts` (los dos ejes) y `vistas/vanosLinea.ts` (numeración corrida de vanos).

**RCA (`99 §ADR-020`):** PROHIBIDO reintroducir ranking de hipótesis (ordenar es dictaminar), causa
raíz sugerida por IA (un borrador es un ancla), porcentaje de confianza, barra de progreso, y el
estado «no aplica» en una espina (es el atajo que vacía un Ishikawa) · el botón de declarar la causa
NO EXISTE mientras falte una de las seis condiciones · una hipótesis con sustento SOLO climático la
topa el motor en «baja» · el clima se consulta cuando el Ingeniero lo pide, nunca al pintar.

## 🧭 Cómo retomar

1. **Abrir Claude Code DENTRO de `~/Desktop/GitHub-MJ/mantenimiento-lineas-at/`.** Desde el paraguas
   el gate bloquea el commit por canario de boot (remedio: `node scripts/session-handoff.mjs --boot-echo`;
   el mensaje engaña: dice «presupuesto de boot excedido» cuando es el canario).
2. Producción **https://mantenimiento-lineas-at.pages.dev** · repo PÚBLICO → **cero bytes de
   cliente, ni en las pruebas** (`33 · L-23`).
3. **Desplegar es `npm run build && npm run deploy --workspace web`**, en ese orden: `deploy` NO
   construye y se puede subir un `dist/` rancio (`32 · L-35`). Y las **reglas de Firestore van por
   SU canal**: `npx firebase deploy --only firestore:rules --project mantenimiento-lineas-at`
   (`31 · L-22`, del que `32 · L-36` es la recaída).
4. **Verificar contra PRODUCCIÓN con el Chrome del Ingeniero** y **preguntarle a la pestaña qué
   bundle cargó** — nunca comparar contra `dist/`, que comparte la causa del fallo (`32 · L-18/35`).
   Cloudflare sirvió las dos versiones a la vez durante la propagación: esperar 5 lecturas iguales.
5. Antes de CADA push: `npm test` + `contrato:verificar` + `brain:check` (el conteo de pruebas vivo
   lo da `05`, no esta línea) y **buscar coordenadas a mano** — no hay comando que lo haga:
   `git diff --cached | grep -nE '(^\+.*)(10\.[0-9]{4,}|-7[45]\.[0-9]{4,})'`. Documentar TODO fallo
   en su nodo de lecciones ANTES de commitear.
6. Autenticado en esta Mac: `gh`, `wrangler` (ajimenezp99), `firebase`. Llaves admin en Descargas.

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

## 🔲 Pendientes de CLAUDE — en este orden

| # | Qué | Dónde está el plan |
|---|---|---|
| **TODO-50** | **Blindaje de acceso** (el porqué completo ya está en el ADR, aquí solo lo que falta): ✅ F1 herramienta de alta · ✅ F2a correo+contraseña en producción · ⬜ **2b retirar Google** (espera la contraseña del Ingeniero) · ⬜ 3 pantalla de cambio obligatorio + vistas filtradas por rol · ⬜ 4 rol en el portero + **App Check** | `99 §ADR-019` |
| **TODO-52** | **RCA, lo que falta**: informe del análisis con sus límites impresos · guardar el sondeo de clima como `SondeoClima` (el contrato ya existe, la pantalla aún no lo persiste) · **las acciones CAPA no se pueden ni CREAR**: el esquema `Accion` existe en `contratos/src/rca.ts` y ninguna pantalla lo escribe — no es «falta el ciclo de vida», es que falta entero · lienzo del árbol | `99 §ADR-020` |
| **TODO-53** | **El horizonte no distingue los dos ejes**: una torre se pinta hueca si le falta el veredicto en CUALQUIERA de los dos. Con 0 de 24 en ambos da igual; **el día que un eje avance antes que el otro, el dibujo dirá «no dictaminado» de un apoyo que sí lo está en un eje** | `99 §ADR-018` (deuda declarada) |
| **TODO-49** | Bloqueantes de la crítica: 3 de 4 portados. Falta el **contador de PARQUE**, no construible hoy (solo se carga la línea abierta) | `99 §ADR-018` |
| **TODO-48** | **Deuda de ADR-017**: el criterio del veredicto longitudinal no menciona el ruido de tendido ni el piso de validez; `funcionProcedencia` no viaja a la fila | `99 §ADR-017` |
| **TODO-42/37** | **Informe gerencial** del expediente (10 secciones especificadas) | crudo de **ADR-012** |
| **TODO-30** | CI: validación XSD real de GPX/KML | crudo de **ADR-013** |
| **TODO-11** | F1 · Nota técnica LN-627 con las correcciones de la auditoría | — |
| **TODO-13/14/15/16/21/22/23** | F3-F5: invalidación por tramo · sincronización bifurcada · Firestore vs D1 · flujo IA con `ProveedorFalso` · prueba de navegador · secretos de despliegue | — |

## ✅ Consolidado (detalle → ADR-001…020)

- **Modelo**: 24 estructuras + 2 empalmes (NO son apoyos), 23 vanos, tramos 1-2-2-14-1-3 (`40 §10`).
- **Workspaces**: `nucleo/` · `contratos/` **(v0.4.0)** · `exportar/` · `web/` · `evidencias/`.
- **Hallazgos reales**: 14 de 23 vanos fuera de la banda del VIR · **3 apoyos amplifican** (E06
  ×1,716 = 72 % más, con 118,2°) · los 2 terminales soportan el tiro entero (2.339 kgf/conductor).
- **EL HUECO MAYOR, y hay que verlo siempre**: **0 de 24 apoyos tienen veredicto, en LOS DOS EJES**.
  El motor YA puede dictaminar; falta el DATO — ningún apoyo declara `cargaRotura_kgf` ni
  `capacidadLongitudinal` ni `nFasesAmarradas`. Es un hueco del INVENTARIO, y lo cierra `TODO-02`.
- **Las 103 fotos se sirven** y cada una sabe de quién es. ⚠️ `e07` es **E06** (`99 §ADR-015`).
- **IDEAM verificado 04-08**: CORS abierto, ~11 días de desfase y **rayos sin dato utilizable** en
  el Caribe. Sus tres trampas (la consulta que se cuelga, las limnimétricas, lat/lon
  intercambiadas) ya son lección: **`31 · L-37`** — no volver a investigarlas.

## 🚫 Callejones ya probados (no repetir — detalle en `30` y sus hijos)

- Un agente que muere deja código **SIN VALIDAR**, no roto (`30 · L-24`). Un módulo probado que
  ninguna pantalla llama es invisible (`30 · L-28`). Verde no prueba nada (`30 · L-33`).
- **Verificar contra un artefacto que comparte la causa del fallo** (`32 · L-35`): el oráculo
  contaminado da verde siempre.
- **Contar una cosa y decir que cuentas otra** (`99 §ADR-017`), y su gemela de esta sesión: afirmar
  algo que la propia evidencia del expediente contradice (`99 §ADR-020`, sección final).
