# 🗂️ 00 — ÍNDICE (capa de enrutamiento del cerebro)

> **No se auto-carga.** Es el mapa: ante una duda, NO escanees el cerebro entero — ven aquí, busca el
> síntoma y ve a la neurona que lo resuelve. Si una neurona existe y este índice no la conoce, el
> cerebro está roto (`CLAUDE.md §G.5`).

---

## Neuronas del proyecto

| Nodo | Qué guarda | Se carga |
|---|---|---|
| `CLAUDE.md` | Tronco encefálico: identidad, doctrinas y gobernanza | **siempre** |
| `docs/05-ESTADO-GLOBAL.md` | Signos vitales: en qué estado está el sistema AHORA | **siempre** |
| `docs/10-MEMORIA-CORTO-PLAZO.md` | Pizarra del trabajo vivo (WIP) y pendientes `TODO-NN` | **siempre** |
| `docs/20-MEMORIA-ESPACIAL.md` | Dónde vive cada cosa: mapa de carpetas, módulos y flujos | bajo trigger 🟡 |
| `docs/30-LECCIONES.md` | Memoria procedimental (madre): índice de los 33 `L-NN` + las lecciones de método | bajo trigger 🧪 |
| `docs/31-LECCIONES-PROVEEDORES.md` | Hija de `30`: lo que depende de un tercero — su factura, su licencia o su SDK | bajo trigger 🧪 |
| `docs/32-LECCIONES-PANTALLA.md` | Hija de `30`: el cálculo salió bien y el usuario ve otra cosa | bajo trigger 🧪 |
| `docs/33-LECCIONES-NUCLEO-Y-DATO.md` | Hija de `30`: el número que se firma y el dato que no puede salir del repo | bajo trigger 🧪 |
| `docs/40-DOMINIO-LINEAS-AT.md` | Lóbulo de dominio: ingeniería de líneas AT, fórmulas y su procedencia | bajo trigger 🔵 |
| `docs/99-HISTORIAL-ADR.md` | Largo plazo: por qué se decidió cada cosa (`ADR-NNN`) | bajo trigger 🟢 |

**Fuera del repo:** `../brain-private/mantenimiento-lineas-at/` — bóveda privada, uso local.
Guarda `research-archive/` (crudos de deliberación: comités, consejos externos) y `fixtures/`
(datos reales de cliente que las pruebas usan pero que **no** se commitean).

---

## Síntoma → neurona

| Si te pasa esto… | Ve a… |
|---|---|
| «¿en qué estado está el proyecto?» | `05` |
| «¿qué estaba haciendo?, ¿qué quedó pendiente?» | `10` |
| «¿dónde vive este módulo / esta función / este flujo?» | `20` |
| «esto ya lo intenté y falló», «¿esta operación tiene truco?» | `30` (índice) y de ahí al hijo |
| «entra en local y falla en producción», «no me deja entrar / leer» | `31` |
| «desplegué y la pantalla sigue igual», «el mapa es un rectángulo gris» | `32` |
| «este número del informe firmable no cuadra» | `33` |
| «¿qué es el vano ideal de regulación?», «¿de dónde sale esta fórmula?» | `40` |
| «¿por qué se eligió este stack y no el otro?» | `99` |
| «¿por qué la prueba espera exactamente este número?» | `40 §8` y `tests/nucleo.test.js` |
| «voy a tomar una decisión cara de revertir» | `CLAUDE.md §G.2` 🛰️ + comité + consejo externo |
| «¿puedo commitear este archivo?» | `33 · L-07`, `L-23` y `.gitignore` |
| «¿esto cuesta dinero?» | `31 · L-02`, `L-04` y `99` |

---

## Mapa de código (resumen — detalle en `20`)

| Carpeta | Qué es |
|---|---|
| `nucleo/` | Cálculo de ingeniería: funciones **puras**, sin DOM ni red. El activo portado del módulo de campo. |
| `tests/` | Pruebas de oro del núcleo. Si algo aquí se pone rojo, es una regresión. |
| `scripts/` | **Kernel del cerebro** — no se edita aquí (se edita en `../brain-private/kernel/`). |
| `githooks/` | `pre-commit`: corre los gates del cerebro y bloquea el commit si algo está mal. |
| `docs/` | Las neuronas de este índice. |

---

## Historial de decisiones (`99`)

| ADR | Fecha | Decisión | Crudo de respaldo |
|---|---|---|---|
| `ADR-001` | 2026-07-29 | Arquitectura y stack de la plataforma | `research-archive/2026-07-28-comite-vision-arquitectura.md` |
| `ADR-002` | 2026-07-29 | Integración del Consejo Externo: confirma ADR-001 y lo enmienda en 3 puntos | `research-archive/2026-07-29-consejo-externo-respuesta.md` |
| `ADR-003` | 2026-07-29 | El Ingeniero fija alcance (plataforma completa e independiente) y presupuesto (asume el coste al pasarse) | — (decisión directa del dueño) |
| `ADR-004` | 2026-07-29 | Subsistema de IA (API de Anthropic) y contrato para trabajar frontend y backend en paralelo | `research-archive/2026-07-29-arquitectura-ia-y-paralelo.md` |
| `ADR-005` | 2026-07-29 | Framework del frontend: React 19 como aplicación de una sola página, sin meta-framework | `research-archive/2026-07-29-comite-framework-frontend.md` |
| `ADR-006` | 2026-07-30 | Exportadores GPX/KML/CSV: paridad de formato con el original, verdad del modelo corregido | `tests/exportar.test.js` (evidencia reproducible) |
| `ADR-007` | 2026-07-30 | Auditoría original-vs-web (7 auditores Opus) y Ola 1 premium ejecutada | `research-archive/2026-07-30-auditoria-original-vs-web-7-dimensiones.json` |
| `ADR-008` | 2026-07-31 | Décima colección `investigaciones`: el expediente de falla es un tipo propio | bóveda `fixtures/LN-627-falla.json` |
| `ADR-009` | 2026-07-31 | Inventario de brechas (79, 31 P0) y primera tanda de cierre: diagramas, umbrales, vano a vano, cantidades, coherencia | `research-archive/2026-07-31-brecha-original-vs-web-8-segmentos.json` |
| `ADR-010` | 2026-08-01 | Cómo se sirven las fotos: un portero (Worker) que verifica la firma del token delante del depósito privado | — (decisión de arquitectura, sin comité) |
| `ADR-011` | 2026-08-01 | La carga sobre la estructura: pestaña «Cargas» (la 11ª) y contrato v0.2.0 con las dos alturas del apoyo | `tests/cargas-vista.test.js` (evidencia reproducible) |
| `ADR-012` | 2026-08-01 | El eje longitudinal (terminal · desequilibrio · rotura), diseñado con workflow de 7 agentes y verificado a mano contra el motor | `research-archive/2026-08-01-workflow-eje-longitudinal.json` |
| `ADR-013` | 2026-08-03 | Auditoría adversarial de la ola 4: 9 fallos que 564 pruebas en verde no veían, incluido un portero que fallaba ABIERTO | `research-archive/2026-08-03-auditoria-ola-4.json` |
| `ADR-014` | 2026-08-03 | Los once menores cerrados: un dueño único para la deflexión y para el dialecto CSV, el tope de tiro con su procedencia verdadera, y las barreras imaginarias del portero corregidas | `research-archive/2026-08-03-auditoria-ola-4.json` |
| `ADR-015` | 2026-08-03 | Una foto puede colgar de un APOYO; y el número del archivo es el del PUNTO del levantamiento, no el de la estructura: `e07` es E06 | `research-archive/2026-08-03-auditoria-ola-4.json` |
| `ADR-016` | 2026-08-03 | El nodo de lecciones partido en madre-índice + 3 hijos por tema; los `L-NN` no se renumeran porque los cita el código fuente | `research-archive/2026-08-03-workflow-shard-nodo-30.json` |

> Toda decisión cara de revertir entra aquí con su ADR y su crudo enlazado. Si hubo comité o consejo
> externo y el crudo no está archivado, la tarea **no está cerrada** (`CLAUDE.md §G.4`).
