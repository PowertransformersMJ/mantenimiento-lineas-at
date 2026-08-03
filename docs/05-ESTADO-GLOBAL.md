# 🩺 05 — ESTADO GLOBAL (Mantenimiento Líneas AT · Heartbeat)

> Signos vitales. **AUTO-CARGA** con `CLAUDE.md` y `10`. Tope ~25 líneas / 4k chars — tablero, no bitácora. Historia → `99`.

| Señal | Valor (al **2026-07-29**) |
|---|---|
| **Misión ahora** | **F0 · Verificación.** Repo creado, cerebro cableado, `nucleo/` portado y verificado. Arquitectura **decidida y revisada externamente**: comité ×3 (ADR-001) + Consejo Externo Gemini 3.1 Pro (ADR-002, confirma en 7 puntos y enmienda 3). Pendientes → `10`. |
| **Build** | 🟢 `npm test` **564 pass / 0 fail** (núcleo + exportes + vistas puras). · verificado-vivo: 2026-08-01 |
| **Repo** | `main` · https://github.com/PowertransformersMJ/mantenimiento-lineas-at · **PÚBLICO** (decisión del Ingeniero 2026-07-29) |
| **Producción** | 🟢 **https://mantenimiento-lineas-at.pages.dev** — Cloudflare Pages, cuenta `ajimenezp99@gmail.com`. Caparazón con línea de demostración: **cero datos de cliente**. Despliegue a mano (`npm run deploy --workspace web`); el automático espera los 2 secretos del repo. · verificado-vivo: 2026-07-29 |
| **Backend** | 🟢 **Un solo trabajador**: el portero de fotos (`evidencias/`), delante de un depósito R2 privado. Adelanta cómputo en servidor a conciencia (ADR-010): es la única forma de no exponer material de cliente. |
| **Coste** | **$0/mes.** R2 activo con 10 GB gratis y 18 MB usados (0,18 %); egress gratis sin límite (verificado en la tarifa oficial, 2026-08-03). Pendiente: alerta de presupuesto. |
| **Cerebro** | kernel íntegro == canónico (la versión la reporta `brain:check`) · bóveda con crudo del comité (477 KB) y fixture de LN-627 |
| **Alcance** | **Plataforma COMPLETA e independiente** (ADR-003): no se integra con Maximo ni SAP, debe traer todo lo necesario. F5 (sincronización campo↔oficina) deja de ser condicional. |
| **Deuda crítica** | 🔴 **7 preguntas a AFINIA sin enviar**: la nº 3 decide si F4 (captura en campo) existe; la nº 4 decide F5 y F6. (✅ motor de cálculo sin deuda desde 07-29, `40 §8` · ✅ Consejo Externo cerrado, ADR-002 · ✅ alcance y presupuesto fijados, ADR-003.) |

## ⚠️ Flags de riesgo activos
- **Repo PÚBLICO** → cero bytes de cliente en git, jamás. La historia de git es permanente (`30 · L-07`). Ya cazó una fuga real esta sesión.
- **El motor puede estar mal y el sistema no fallaría: certificaría.** Riesgo nº 1. Por eso `40 §8` declara qué está verificado y qué no, y **firma el Ingeniero, no el software**.
- **Free-tier con criterio de seguridad:** se prefiere el servicio que APAGA al que COBRA. Una tarjeta prepago no es un tope de gasto (`30 · L-02`).
- **Workflows y subagentes:** siempre acotados y con `model: 'opus'` (orden del Ingeniero).

## 🧩 Sub-sistemas
`nucleo/` ✅ · `exportar/` ✅ (workspace puro, ADR-006/007) · pruebas de oro ✅ · cerebro ✅ · CI ✅ · **pestañas 11/11** ✅ (Cargas: los DOS ejes, ADR-011/012) · `evidencias/` (portero de fotos) ✅ **en producción** (ADR-010) · generador de línea ⬜ F2 · base local ⬜ F3 · captura en campo ⬜ F4 · nube ⬜ F5 · mapas offline ⬜ F4+
