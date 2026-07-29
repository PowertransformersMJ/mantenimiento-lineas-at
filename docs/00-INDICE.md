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
| `docs/30-LECCIONES.md` | Memoria procedimental: gotchas ya pagados (`L-NN`) | bajo trigger 🧪 |
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
| «esto ya lo intenté y falló», «¿esta operación tiene truco?» | `30` |
| «¿qué es el vano ideal de regulación?», «¿de dónde sale esta fórmula?» | `40` |
| «¿por qué se eligió este stack y no el otro?» | `99` |
| «¿por qué la prueba espera exactamente este número?» | `40 §8` y `tests/nucleo.test.js` |
| «voy a tomar una decisión cara de revertir» | `CLAUDE.md §G.2` 🛰️ + comité + consejo externo |
| «¿puedo commitear este archivo?» | `30 · L-07` y `.gitignore` |
| «¿esto cuesta dinero?» | `30 · L-02`, `L-04` y `99` |

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

> Toda decisión cara de revertir entra aquí con su ADR y su crudo enlazado. Si hubo comité o consejo
> externo y el crudo no está archivado, la tarea **no está cerrada** (`CLAUDE.md §G.4`).
