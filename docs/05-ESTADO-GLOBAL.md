# 🩺 05 — ESTADO GLOBAL (Mantenimiento Líneas AT · Heartbeat)

> Signos vitales. **AUTO-CARGA** con `CLAUDE.md` y `10`. Tope ~25 líneas / 4k chars — tablero, no bitácora. Historia → `99`.

| Señal | Valor (al **2026-08-17**) |
|---|---|
| **Misión ahora** | **Cerrar el hueco del DATO, no el del código.** El producto está en producción con 11 pestañas + segmento RCA; el motor ya sabe dictaminar y **0 de 24 apoyos tienen veredicto** porque falta la ficha estructural. Todo lo demás es secundario hasta que llegue (`TODO-57`): es herramienta INTERNA, sin cliente ni contrato (`ADR-022`). Arquitectura revisada externamente (ADR-001/002). Pendientes → `10`. |
| **Build** | 🟢 `npm test` **1.206 pass / 0 fail** (núcleo · exportes · vistas · método RCA · el CONTRATO · y desde el 16-08 la **IDENTIDAD de los apoyos**: los 26 ids de producción escritos literales, que hasta ese día podían cambiar con todo en verde, `99 §ADR-027`). `npm run contrato:verificar` exit 0, **contrato v0.5.0**. · verificado-vivo: 2026-08-17 |
| **Repo** | `main` · https://github.com/PowertransformersMJ/mantenimiento-lineas-at · **PÚBLICO** (decisión del Ingeniero 2026-07-29) |
| **Producción** | 🟢 **https://mantenimiento-lineas-at.pages.dev** — Cloudflare Pages, cuenta `ajimenezp99@gmail.com`. **Piel CLARA** desde el 04-08 («El Horizonte» F3): contraste medido en las 11 pestañas, **0 bajo el mínimo** y ningún elemento perdido; el visor de fotos sigue oscuro a propósito. **Se despliega a mano, procedimiento en `10`** (`build` delante: `deploy` NO construye, `32 · L-35`); el automático espera 2 secretos. **Contrato v0.5.0 desde el 17-08** (verificado en el pie y en el bundle servido). · verificado-vivo: 2026-08-17 |
| **Backend** | 🟢 **Un solo trabajador**: el portero de fotos (`evidencias/`), delante de un depósito R2 privado (ADR-010). Los datos viven en **Firestore** con RBAC por *claims* desde el 04-08; **el ingreso exige contraseña y no hay registro público** (ADR-019). |
| **Coste** | **$0/mes.** R2: 10 GB gratis, ~35 MB usados (0,35 %), egress gratis (tarifa oficial 2026-08-03). Pendiente: alerta de presupuesto. **Criterio:** se prefiere el servicio que APAGA al que COBRA; una tarjeta prepago no es un tope de gasto (`31 · L-02`). |
| **Cerebro** | kernel íntegro == canónico (la versión la reporta `brain:check`) · bóveda con crudo del comité (477 KB) y fixture de LN-627 |
| **Alcance** | **Plataforma COMPLETA e independiente** (ADR-003): no se integra con Maximo ni SAP, debe traer todo lo necesario. F5 (sincronización campo↔oficina) deja de ser condicional. |
| **Deuda crítica** | 🔴 **La ficha estructural de los 24 apoyos** (`TODO-57`): sin ella el motor no puede dictaminar ninguno. 🟡 Dónde deben vivir los datos del empleador (`TODO-58`). (✅ motor sin deuda desde 07-29, `40 §8` · ✅ Consejo Externo, ADR-002 · ✅ alcance y presupuesto, ADR-003 · ✅ contexto real fijado, **ADR-022**: sin cliente ni contrato — `TODO-02` retirado por falta de objeto.) |

## ⚠️ Flags de riesgo activos
- **Repo PÚBLICO** → cero bytes de cliente en git, jamás. La historia de git es permanente (`33 · L-07`). Ya cazó una fuga real esta sesión.
- **El motor puede estar mal y el sistema no fallaría: certificaría.** Riesgo nº 1. Por eso `40 §8` declara qué está verificado y qué no, y **firma el Ingeniero, no el software**.
- **Workflows y subagentes:** siempre acotados y con `model: 'opus'` (orden del Ingeniero).
- 🔴 **App Check NO existe** y `CLAUDE.md §1` lo declara «obligatorio desde el día 1». Mientras falte, el sitio público puede llamar a Firebase sin probar que es él. Cierra en `TODO-50 fase 4`.

## 🧩 Sub-sistemas
`nucleo/` ✅ · `exportar/` ✅ (workspace puro, ADR-006/007) · pruebas de oro ✅ · cerebro ✅ · CI ✅ · **pestañas 11/11** ✅ · **segmento RCA** ✅ (ADR-020: fuera de la línea, con clima IDEAM sin servidor) · `evidencias/` (portero de fotos) ✅ **en producción** (ADR-010) · generador de línea ⬜ F2 · base local ⬜ F3 · captura en campo ⬜ F4 · nube ⬜ F5 · mapas offline ⬜ F4+
