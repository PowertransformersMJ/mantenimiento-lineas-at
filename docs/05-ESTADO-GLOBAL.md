# 🩺 05 — ESTADO GLOBAL (Mantenimiento Líneas AT · Heartbeat)

> Signos vitales. **AUTO-CARGA** con `CLAUDE.md` y `10`. Tope ~25 líneas / 4k chars — tablero, no bitácora. Historia → `99`.

| Señal | Valor (al **2026-08-22**) |
|---|---|
| **Misión ahora** | **Llenar la ficha estructural.** El motor dictamina desde julio y siguen **0 de 26** con veredicto: la pantalla existe (`99 §ADR-030`) y desde el 20-08 también **por lote** (`§ADR-038`) — que trae el tercio de catálogo y **no mueve ningún veredicto solo**: faltan las dos alturas, que no van por lote (`33 · L-59`). Pregunta del Ingeniero (`TODO-57`): ¿están en planos y actas, o hay que levantarlas? Herramienta INTERNA (`ADR-022`). Pendientes → `10`. |
| **Build** | 🟢 `npm test` **1.840 pass / 0 fail** · `contrato:verificar` exit 0, **contrato v0.9.0** · motor v0.3.0 · verificado-vivo: 2026-08-22 |
| **Repo** | `main` · https://github.com/PowertransformersMJ/mantenimiento-lineas-at · **PÚBLICO** (decisión del Ingeniero 2026-07-29) |
| **Producción** | 🟢 **https://mantenimiento-lineas-at.pages.dev** — Cloudflare Pages, cuenta `ajimenezp99@gmail.com`. **Piel CLARA** desde el 04-08. **Se despliega a mano**, `build` delante: `deploy` NO construye (`32 · L-35`). Último: **la línea completa y el clima del año**. Se cargaron el pórtico de ORIGEN y un empalme (`ADR-054`): **30 puntos · 26 estructuras · 3.032,8 m**. Los CINCO atlas entran al mapa como dato del sitio (`ADR-055/056/060`) y el clima de la línea pasa a UN eje de fecha con el día, el mes y el veredicto contra el tope (`ADR-057/058/059`). **Recorrido en vivo con su sesión · hash servido == construido.** · verificado-vivo: 2026-08-22 |
| **Backend** | 🟢 **Un solo trabajador**: el portero de fotos (`evidencias/`), delante de un R2 privado (ADR-010). Los datos viven en **Firestore** con RBAC por *claims*; **el ingreso exige contraseña y no hay registro público** (ADR-019). |
| **Coste** | **$0/mes.** R2: 10 GB gratis, ~35 MB usados (tarifa oficial 2026-08-03). Pendiente: alerta de gasto. **Criterio:** se prefiere el que APAGA al que COBRA (`31·L-02`). |
| **Cerebro** | kernel íntegro == canónico (versión → `brain:check`) · bóveda con crudo del comité (477 KB) y fixture de LN-627 |
| **Alcance** | **Plataforma COMPLETA e independiente** (ADR-003): no se integra con Maximo ni SAP. F5 (sincronización campo↔oficina) deja de ser condicional. |
| **Deuda crítica** | 🔴 **El DATO de la ficha de los 26 apoyos** (`TODO-57`): la pantalla existe —una a una y por lote—, el dato no; el lote solo trae el tercio de catálogo (`33 · L-59`). 🟡 Dónde deben vivir los datos del empleador (`TODO-58`) · 🟡 **viento y los 1.000 W/m² de la ampacidad siguen ADOPTADOS**: piden serie histórica (`TODO-71`). (ya cerradas: motor sin deuda `40 §8` · ADR-002/003/022/032.) |

## ⚠️ Flags de riesgo activos
- **Repo PÚBLICO** → cero bytes de cliente en git, jamás. La historia de git es permanente (`33 · L-07`); ya cazó una fuga real.
- **El motor puede estar mal y el sistema no fallaría: certificaría.** Riesgo nº 1. Por eso `40 §8` declara qué está verificado y qué no, y **firma el Ingeniero**.
- **Workflows y subagentes:** acotados y con `model: 'opus'` (orden del Ingeniero).
- 🔴 **App Check NO existe** y `CLAUDE.md §1` lo declara «obligatorio desde el día 1». Mientras falte, el sitio público puede llamar a Firebase sin probar que es él. Cierra en `TODO-50 fase 4`.

## 🧩 Sub-sistemas
`nucleo/` ✅ · `exportar/` ✅ (workspace puro, ADR-006/007) · pruebas de oro ✅ · cerebro ✅ · CI ✅ · **pestañas 14/14** ✅ · **capas del mapa** ✅ (ADR-034/037/**046**) · **CINCO atlas del Caribe** ✅ (ADR-045/**053**/**055**/**056**/**060**: sol · temperatura · viento · lluvia · nubes; pantalla propia y DENTRO del mapa, en UN eje de fecha) · **segmento RCA** ✅ (ADR-020, APARCADO por él) · `evidencias/` (portero de fotos) ✅ **en producción** (ADR-010) · generador de línea ⬜ F2 · base local ⬜ F3 · captura en campo ⬜ F4 · nube ⬜ F5 · mapas offline ⬜ F4+
