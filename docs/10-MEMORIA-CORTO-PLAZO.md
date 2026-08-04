# 📝 10 — MEMORIA DE CORTO PLAZO (pizarra del trabajo vivo)

> Se **AUTO-CARGA**. Es pizarra, no bitácora (§G.3). Tope ~110 líneas / 16k chars.
> **RELEVO DE SESIÓN 2026-08-04** — la conversación anterior llegó al tope de contexto.
> Este nodo ES el relevo: léelo entero antes de tocar nada. Si contradice a
> `docs/.handoff-auto.md` (foto real de git), manda ese.

## 🎯 Dónde estamos

**673 pruebas en verde · contrato v0.3.0 · cerebro sano · todo empujado y desplegado.**
11 pestañas vivas. Producción verificada EN PANTALLA con el Chrome del Ingeniero, no solo por hash.

**La ola de auditoría está cerrada entera (ADR-013…017).** En una sola jornada: los 11 hallazgos
menores, las 99 fotos de estructura repartidas, el nodo de lecciones partido y el veredicto
longitudinal llegando al producto. Detalle en `99`; aquí solo lo que cambia decisiones.

## 🛑 LO PRIMERO AL RETOMAR

1. **ELEGIR CARCASA — y ahora son DOS decisiones, no una** (`disenos/README.md`):
   **(a) el esqueleto**, una de las 4 tesis de navegación; **(b) la piel**, oscura o luminosa.
   La (b) ya la contestó él el 04-08: vio las 4 y dijo *«sigue oscuro, necesito algo más armonioso,
   como paisajes»* → nace **`5-horizonte.html`**: cielo que codifica el estado de la línea, horizonte
   con los apoyos reales y **el apoyo sin veredicto dibujado HUECO**. Su argumento no es estético:
   en pantalla clara un dato que falta se ve como agujero de luz; en oscura se confunde con el fondo.
   La piel es independiente del esqueleto — se puede montar sobre cualquiera de las 4.
   **La crítica de oficio ya corrió** (crudo: `research-archive/2026-08-04-workflow-critica-carcasa.json`).
   Su hallazgo manda sobre la elección: **las 4 dejan que una línea salga «sana» con 0 apoyos
   dictaminados**, y 2 lo AFIRMAN — en `2-tablero` «firmable» es una cadena a mano que gobierna el
   sello; en `3-expediente` `firmable = hip.congelada && estado==='bien'`, sin mirar capacidad. En
   `1-columnas` es omisión: `avisos()` nunca cuenta el veredicto. Verificado leyendo el código, no
   fiado del subagente. Ranking: 1 · 4 · 3 · 2, con 6 bloqueantes comunes.
   Al cerrar ambas → implementar + `ADR-018` + crudo ya archivado.
2. **El tope de tiro sigue sin decidir (TODO-33).** Único bloqueo original que queda. Desde ADR-014
   `tiroAdmisible_pct` y `criterioTiroQueRige` YA existen en el contrato: su decisión ya tiene por
   dónde entrar. Ojo: `vistas/tramos.ts`, `vientoDatos.ts` y `Fundamentos.tsx` siguen leyendo
   `tiroMaximoAdmisible()` = 0,5·RTS fijo en código — unificarlo al cerrar la decisión.
3. **Alerta de presupuesto en Cloudflare (TODO-44).** R2 no apaga: factura. ~35 MB de 10 GB gratis.

## 🧭 Cómo retomar

1. **Abrir Claude Code DENTRO de `~/Desktop/GitHub-MJ/mantenimiento-lineas-at/`.** Desde el paraguas
   el gate bloquea el commit por canario de boot (remedio: `node scripts/session-handoff.mjs --boot-echo`;
   el mensaje engaña: dice «presupuesto de boot excedido» cuando es el canario).
2. Producción **https://mantenimiento-lineas-at.pages.dev** · repo PÚBLICO → **cero bytes de
   cliente, ni en las pruebas** (`33 · L-23`). Desplegar: `npm run build && npm run deploy --workspace web`.
3. **Verificar contra PRODUCCIÓN con el Chrome del Ingeniero** y **preguntarle a la pestaña qué
   bundle cargó** (`32 · L-18`). Esta sesión sirvió caché vieja dos veces por saltarse esto.
4. Antes de CADA push: auditoría de coordenadas + `npm test` (673) + `contrato:verificar` +
   `brain:check`. Documentar TODO fallo en su nodo de lecciones ANTES de commitear.
5. Autenticado en esta Mac: `gh`, `wrangler` (ajimenezp99), `firebase`. Llave admin en Descargas.

## 🔲 Pendientes del INGENIERO

| # | Qué | Por qué importa |
|---|---|---|
| **NUEVO** | **Elegir ESQUELETO** entre las 4 de `disenos/` | Es lo que pidió y está entregado, a la espera |
| **NUEVO** | **Confirmar la PIEL luminosa** de `5-horizonte.html` | Responde a su «como paisajes»; falta su ojo |
| **TODO-33** | **Decidir 50 % o 25 % de RTS** como tope de tiro | El motor calcula con 50 % y la doctrina dice 25 % |
| **TODO-44** | **Alerta de presupuesto** en Cloudflare (sugerido 1 USD) | R2 no apaga: factura |
| **TODO-34** | **Respaldo de la bóveda**: sin remoto, 337 MB. **SUBIÓ DE PRIORIDAD**: la única prueba de que `e07` es E06 vive en un HTML de 30 MB en Descargas, sin copia | Sin él, la asignación de las 99 fotos deja de ser reproducible |
| **TODO-02** | Enviar a AFINIA las **7 preguntas** (`99 §ADR-001`) | La 3 decide si F4 existe; la 4 decide F5/F6 |
| **TODO-03** | Cronometrar el proceso actual de LN-627 (20 min) | Sin eso el ahorro prometido es inventado |
| **TODO-25** | Probar con su sesión: descargas, Fundamentos, popup, Salir | El clasificador bloquea el usuario de prueba (`30 · L-17`) |
| **TODO-36** | **Fichas editable** (hecho fechado, no sobrescritura): DECISIÓN FUERTE | Mayor hueco de paridad que queda |

## 🔲 Pendientes de CLAUDE — en este orden

| # | Qué | Dónde está el plan |
|---|---|---|
| **TODO-47** | **Implementar la carcasa elegida** (esqueleto + piel) + ADR-018 + crudo. La crítica de oficio pendiente **ya se relanzó el 04-08** (4 críticos Opus + síntesis, solo eje esqueleto) | `disenos/README.md` |
| **TODO-48** | **Deuda de ADR-017**: el criterio del veredicto longitudinal no menciona el ruido de tendido ni el piso de validez; `funcionProcedencia` no viaja a la fila (en LN-627 vale «deducido_geometria») | `99 §ADR-017` |
| **TODO-42/37** | **Informe gerencial** del expediente (10 secciones especificadas) | crudo de **ADR-012** |
| **TODO-30** | CI: validación XSD real de GPX/KML | crudo de **ADR-013** |
| **TODO-11** | F1 · Nota técnica LN-627 con las correcciones de la auditoría | — |
| **TODO-13/14/15/16/21/22/23** | F3-F5: invalidación por tramo · sincronización bifurcada · Firestore vs D1 · flujo IA con `ProveedorFalso` · prueba de navegador · secretos de despliegue | — |

## ✅ Consolidado (detalle → ADR-001…017)

- **Modelo**: 24 estructuras + 2 empalmes (NO son apoyos), 23 vanos, tramos 1-2-2-14-1-3 (`40 §10`).
- **Workspaces**: `nucleo/` · `contratos/` **(v0.3.0)** · `exportar/` · `web/` · `evidencias/` (en producción).
- **Hallazgos reales**: 14 de 23 vanos fuera de la banda del VIR · **3 apoyos amplifican** (E06
  ×1,716 = 72 % más, con 118,2°) · los 2 terminales soportan el tiro entero (2.339 kgf/conductor).
- **EL HUECO MAYOR, y hay que verlo siempre**: **0 de 24 apoyos tienen veredicto, en LOS DOS EJES**.
  El motor YA puede dictaminar (ADR-017); lo que falta es el DATO — ningún apoyo declara
  `cargaRotura_kgf` ni `capacidadLongitudinal` ni `nFasesAmarradas`. Es un hueco del INVENTARIO.
- **Las 103 fotos se sirven** y cada una sabe de quién es. ⚠️ `e07` es **E06**, no E07: el número
  del archivo es el del PUNTO del levantamiento, empalmes incluidos (`99 §ADR-015`).
- **Cerebro**: 33 lecciones (ids hasta 34; el 14 se fusionó en el 13). Madre `30` = índice + 7 de
  método; hijos `31` proveedores · `32` pantalla · `33` núcleo y dato.

## 🚫 Callejones ya probados (no repetir — detalle en `30` y sus hijos)

- Un agente que muere deja código **SIN VALIDAR**, no roto: inventariar sus entregables uno a uno
  (`30 · L-24`). Pasó DOS veces hoy y la segunda dejó todo un eje como código muerto en producción.
- Un módulo probado que **ninguna pantalla llama** es invisible (`30 · L-28`). También hoy, dos veces.
- Verde no prueba nada: 667 pruebas pasaban con el veredicto inalcanzable desde la app (`30 · L-33`).
- Contar una cosa y decir que cuentas otra: el informe afirmaba «ningún apoyo declara capacidad»
  contando VEREDICTOS (`99 §ADR-017`). Mismo patrón que ADR-014 tuvo que arreglar en cinco sitios.
- El navegador sirve su caché aunque cambies la URL con `?v=` (`32 · L-18`).
