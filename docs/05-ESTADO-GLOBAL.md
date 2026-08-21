# 🩺 05 — ESTADO GLOBAL (Mantenimiento Líneas AT · Heartbeat)

> Signos vitales. **AUTO-CARGA** con `CLAUDE.md` y `10`. Tope ~25 líneas / 4k chars — tablero, no bitácora. Historia → `99`.

| Señal | Valor (al **2026-08-20**) |
|---|---|
| **Misión ahora** | **Llenar la ficha estructural.** El motor dictamina desde julio y siguen **0 de 25** con veredicto: la pantalla existe (`99 §ADR-030`) y desde el 20-08 también **por lote** (`§ADR-038`) — que trae el tercio de catálogo y **no mueve ningún veredicto solo**: faltan las dos alturas, que no van por lote (`33 · L-59`). La pregunta es del Ingeniero (`TODO-57`): ¿están en planos y actas, o hay que levantarlas? Herramienta INTERNA, sin cliente ni contrato (`ADR-022`). Pendientes → `10`. |
| **Build** | 🟢 `npm test` **1.645 pass / 0 fail** · `contrato:verificar` exit 0, **contrato v0.7.0** · verificado-vivo: 2026-08-21 |
| **Repo** | `main` · https://github.com/PowertransformersMJ/mantenimiento-lineas-at · **PÚBLICO** (decisión del Ingeniero 2026-07-29) |
| **Producción** | 🟢 **https://mantenimiento-lineas-at.pages.dev** — Cloudflare Pages, cuenta `ajimenezp99@gmail.com`. **Piel CLARA** desde el 04-08. **Se despliega a mano** y `build` va delante: `deploy` NO construye (`32 · L-35`). Último: **temperatura del aire con su gradiente** y **satelital al nivel 16** (2,4 m/píxel, 18,9 MiB) tras la corrección de criterio del Ingeniero (`ADR-041`). Todo recorrido en vivo con su sesión. **Hash servido == construido.** · verificado-vivo: 2026-08-20 |
| **Backend** | 🟢 **Un solo trabajador**: el portero de fotos (`evidencias/`), delante de un depósito R2 privado (ADR-010). Los datos viven en **Firestore** con RBAC por *claims* desde el 04-08; **el ingreso exige contraseña y no hay registro público** (ADR-019). |
| **Coste** | **$0/mes.** R2: 10 GB gratis, ~35 MB usados (tarifa oficial 2026-08-03). Pendiente: alerta de presupuesto. **Criterio:** se prefiere el servicio que APAGA al que COBRA (`31 · L-02`). |
| **Cerebro** | kernel íntegro == canónico (la versión la reporta `brain:check`) · bóveda con crudo del comité (477 KB) y fixture de LN-627 |
| **Alcance** | **Plataforma COMPLETA e independiente** (ADR-003): no se integra con Maximo ni SAP, debe traer todo lo necesario. F5 (sincronización campo↔oficina) deja de ser condicional. |
| **Deuda crítica** | 🔴 **El DATO de la ficha de los 24 apoyos** (`TODO-57`): la pantalla existe —una a una y por lote—, el dato no; y el lote solo trae el tercio de catálogo (`33 · L-59`). 🟡 Dónde deben vivir los datos del empleador (`TODO-58`) · 🟡 **viento y los 1.000 W/m² de la ampacidad siguen ADOPTADOS**: piden serie histórica (`TODO-71`). (ya cerradas: motor sin deuda `40 §8` · ADR-002/003/022/032.) |

## ⚠️ Flags de riesgo activos
- **Repo PÚBLICO** → cero bytes de cliente en git, jamás. La historia de git es permanente (`33 · L-07`). Ya cazó una fuga real esta sesión.
- **El motor puede estar mal y el sistema no fallaría: certificaría.** Riesgo nº 1. Por eso `40 §8` declara qué está verificado y qué no, y **firma el Ingeniero, no el software**.
- **Workflows y subagentes:** siempre acotados y con `model: 'opus'` (orden del Ingeniero).
- 🔴 **App Check NO existe** y `CLAUDE.md §1` lo declara «obligatorio desde el día 1». Mientras falte, el sitio público puede llamar a Firebase sin probar que es él. Cierra en `TODO-50 fase 4`.

## 🧩 Sub-sistemas
`nucleo/` ✅ · `exportar/` ✅ (workspace puro, ADR-006/007) · pruebas de oro ✅ · cerebro ✅ · CI ✅ · **pestañas 12/12** ✅ · **capas del mapa** ✅ (ADR-034/037: imágenes autohospedadas; la de datos se guarda como MEDIDA) · **segmento RCA** ✅ (ADR-020: fuera de la línea, con clima IDEAM sin servidor) · `evidencias/` (portero de fotos) ✅ **en producción** (ADR-010) · generador de línea ⬜ F2 · base local ⬜ F3 · captura en campo ⬜ F4 · nube ⬜ F5 · mapas offline ⬜ F4+
