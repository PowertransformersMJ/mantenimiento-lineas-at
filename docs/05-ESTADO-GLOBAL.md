# 🩺 05 — ESTADO GLOBAL (Mantenimiento Líneas AT · Heartbeat)

> Signos vitales. **AUTO-CARGA** con `CLAUDE.md` y `10`. Tope ~25 líneas / 4k chars — tablero, no bitácora. Historia → `99`.

| Señal | Valor (al **2026-08-04**) |
|---|---|
| **Misión ahora** | **Cerrar el hueco del DATO, no el del código.** El producto está en producción con 11 pestañas + segmento RCA; el motor ya sabe dictaminar y **0 de 24 apoyos tienen veredicto** porque falta la ficha estructural. Todo lo demás es secundario hasta que lleguen las 7 preguntas (`TODO-02`). Arquitectura decidida y revisada externamente: comité ×3 (ADR-001) + Consejo Externo (ADR-002). Pendientes → `10`. |
| **Build** | 🟢 `npm test` **714 pass / 0 fail** (núcleo + exportes + vistas + 5 guardias del tablero de color + 27 del método RCA). · verificado-vivo: 2026-08-04 |
| **Repo** | `main` · https://github.com/PowertransformersMJ/mantenimiento-lineas-at · **PÚBLICO** (decisión del Ingeniero 2026-07-29) |
| **Producción** | 🟢 **https://mantenimiento-lineas-at.pages.dev** — Cloudflare Pages, cuenta `ajimenezp99@gmail.com`. **Piel CLARA** desde el 04-08 («El Horizonte» F3): contraste medido en las 11 pestañas, **0 bajo el mínimo** (antes 2) y ningún elemento perdido; el visor de fotos sigue oscuro a propósito. **Se despliega a mano y el procedimiento vive en `10`** (lleva `build` delante: `deploy` NO construye, `32 · L-35`); el automático espera los 2 secretos. · verificado-vivo: 2026-08-04 |
| **Backend** | 🟢 **Un solo trabajador**: el portero de fotos (`evidencias/`), delante de un depósito R2 privado (ADR-010). Los datos viven en **Firestore** con RBAC por *claims* desde el 04-08; **el ingreso exige contraseña y no hay registro público** (ADR-019). |
| **Coste** | **$0/mes.** R2 activo: 10 GB gratis, ~35 MB usados (0,35 %), egress gratis sin límite (tarifa oficial, 2026-08-03). Pendiente: alerta de presupuesto. **Criterio:** se prefiere el servicio que APAGA al que COBRA; una tarjeta prepago no es un tope de gasto (`31 · L-02`). |
| **Cerebro** | kernel íntegro == canónico (la versión la reporta `brain:check`) · bóveda con crudo del comité (477 KB) y fixture de LN-627 |
| **Alcance** | **Plataforma COMPLETA e independiente** (ADR-003): no se integra con Maximo ni SAP, debe traer todo lo necesario. F5 (sincronización campo↔oficina) deja de ser condicional. |
| **Deuda crítica** | 🔴 **7 preguntas a AFINIA sin enviar**: la nº 3 decide si F4 (captura en campo) existe; la nº 4 decide F5 y F6. (✅ motor de cálculo sin deuda desde 07-29, `40 §8` · ✅ Consejo Externo cerrado, ADR-002 · ✅ alcance y presupuesto fijados, ADR-003.) |

## ⚠️ Flags de riesgo activos
- **Repo PÚBLICO** → cero bytes de cliente en git, jamás. La historia de git es permanente (`33 · L-07`). Ya cazó una fuga real esta sesión.
- **El motor puede estar mal y el sistema no fallaría: certificaría.** Riesgo nº 1. Por eso `40 §8` declara qué está verificado y qué no, y **firma el Ingeniero, no el software**.
- **Workflows y subagentes:** siempre acotados y con `model: 'opus'` (orden del Ingeniero).
- 🔴 **App Check NO existe** y `CLAUDE.md §1` lo declara «obligatorio desde el día 1». Mientras falte, el sitio público puede llamar a Firebase sin probar que es él. Cierra en `TODO-50 fase 4`.

## 🧩 Sub-sistemas
`nucleo/` ✅ · `exportar/` ✅ (workspace puro, ADR-006/007) · pruebas de oro ✅ · cerebro ✅ · CI ✅ · **pestañas 11/11** ✅ · **segmento RCA** ✅ (ADR-020: fuera de la línea, con clima IDEAM sin servidor) · `evidencias/` (portero de fotos) ✅ **en producción** (ADR-010) · generador de línea ⬜ F2 · base local ⬜ F3 · captura en campo ⬜ F4 · nube ⬜ F5 · mapas offline ⬜ F4+
