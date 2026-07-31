# 🩺 05 — ESTADO GLOBAL (Mantenimiento Líneas AT · Heartbeat)

> Signos vitales. **AUTO-CARGA** con `CLAUDE.md` y `10`. Tope ~25 líneas / 4k chars — tablero, no bitácora. Historia → `99`.

| Señal | Valor (al **2026-07-29**) |
|---|---|
| **Misión ahora** | **F0 · Verificación.** Repo creado, cerebro cableado, `nucleo/` portado y verificado. Arquitectura **decidida y revisada externamente**: comité ×3 (ADR-001) + Consejo Externo Gemini 3.1 Pro (ADR-002, confirma en 7 puntos y enmienda 3). Pendientes → `10`. |
| **Build** | 🟢 `npm test` **73 pass / 0 fail** (59 núcleo + 14 exportadores golden). CI corre integridad del kernel + suite. · verificado-vivo: 2026-07-30 |
| **Repo** | `main` · https://github.com/PowertransformersMJ/mantenimiento-lineas-at · **PÚBLICO** (decisión del Ingeniero 2026-07-29) |
| **Producción** | 🟢 **https://mantenimiento-lineas-at.pages.dev** — Cloudflare Pages, cuenta `ajimenezp99@gmail.com`. Caparazón con línea de demostración: **cero datos de cliente**. Despliegue a mano (`npm run deploy --workspace web`); el automático espera los 2 secretos del repo. · verificado-vivo: 2026-07-29 |
| **Backend** | ⬜ **Ninguno, a propósito.** F0–F4 corren en la Mac: cero cuentas, cero tarjetas, cero proveedores que puedan cobrar o apagar. |
| **Coste** | **$0/mes.** Primer peso posible en F6, y solo si F5 se disparó. Lo autoriza el Ingeniero. |
| **Cerebro** | kernel íntegro == canónico (la versión la reporta `brain:check`) · bóveda con crudo del comité (477 KB) y fixture de LN-627 |
| **Alcance** | **Plataforma COMPLETA e independiente** (ADR-003): no se integra con Maximo ni SAP, debe traer todo lo necesario. F5 (sincronización campo↔oficina) deja de ser condicional. |
| **Deuda crítica** | 🔴 **7 preguntas a AFINIA sin enviar**: la nº 3 decide si F4 (captura en campo) existe; la nº 4 decide F5 y F6. (✅ motor de cálculo sin deuda desde 07-29, `40 §8` · ✅ Consejo Externo cerrado, ADR-002 · ✅ alcance y presupuesto fijados, ADR-003.) |

## ⚠️ Flags de riesgo activos
- **Repo PÚBLICO** → cero bytes de cliente en git, jamás. La historia de git es permanente (`30 · L-07`). Ya cazó una fuga real esta sesión.
- **El motor puede estar mal y el sistema no fallaría: certificaría.** Riesgo nº 1. Por eso `40 §8` declara qué está verificado y qué no, y **firma el Ingeniero, no el software**.
- **Free-tier con criterio de seguridad:** se prefiere el servicio que APAGA al que COBRA. Una tarjeta prepago no es un tope de gasto (`30 · L-02`).
- **Workflows y subagentes:** siempre acotados y con `model: 'opus'` (orden del Ingeniero).

## 🧩 Sub-sistemas
`nucleo/` ✅ · pruebas de oro ✅ · cerebro + kernel canónico ✅ · CI ✅ · pestañas 5/8 (Resumen·Distancias·Fichas·Mecánico·**Exportar** ✅ 07-30, ADR-006) · generador de línea ⬜ F2 · base local ⬜ F3 · captura en campo ⬜ F4 · nube ⬜ F5 · mapas offline ⬜ F4+
