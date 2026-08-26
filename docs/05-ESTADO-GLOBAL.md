# 🩺 05 — ESTADO GLOBAL (Mantenimiento Líneas AT · Heartbeat)

> Signos vitales. **AUTO-CARGA** con `CLAUDE.md` y `10`. Tope ~25 líneas / 4k chars — tablero, no bitácora. Historia → `99`.

| Señal | Valor (al **2026-08-22**) |
|---|---|
| **Misión ahora** | **Llenar la ficha estructural.** El motor dictamina desde julio y siguen **0 de 26** con veredicto: la pantalla existe, una a una y por lote (`99 §ADR-030/038`), pero el lote solo trae el tercio de catálogo y **no mueve ningún veredicto solo**: faltan las dos alturas (`33 · L-59`). `TODO-57`: ¿están en planos y actas, o hay que levantarlas? Herramienta INTERNA (`ADR-022`). Pendientes → `10`. |
| **Build** | 🟢 `npm test` **1.968 pass / 0 fail** · `contrato:verificar` exit 0, **contrato v0.9.0** · motor v0.3.0 · verificado-vivo: 2026-08-26 |
| **Repo** | `main` · https://github.com/PowertransformersMJ/mantenimiento-lineas-at · **PÚBLICO** (decisión del Ingeniero 2026-07-29) · **rama protegida** (24-08): exige el check del CI, sin fuerza ni borrado, **admins exentos** (`ADR-076`) |
| **Producción** | 🟢 **https://mantenimiento-lineas-at.pages.dev** — Cloudflare Pages (`ajimenezp99@gmail.com`). **A mano**, `build` delante: `deploy` NO construye (`32 · L-35`). La línea: **30 puntos · 26 estructuras · 3.032,8 m** (`ADR-054`). El clima vive en el Atlas, con **el trazado encima** y **de cuándo es el dato** (`ADR-055..075`). **OCHO capas**: cinco del año (POWER) + **rayos**, **Sol ahora** y **Nubes ahora**, las tres del satélite GOES y que se ACUMULAN hora a hora (`ADR-079/081`). Medido: temperatura, viento y lluvia hasta **2026-08-21**; sol y nubes hasta **2026-05-30** (hasta donde publica su fuente); rayos, desde el **23-08**. **hash y cinta verificados en vivo con su sesión** · verificado-vivo: 2026-08-26 |
| **Backend** | 🟢 **Un solo trabajador**: el portero de fotos (`evidencias/`), delante de un R2 privado (ADR-010). Datos en **Firestore** con RBAC por *claims*; **el ingreso exige contraseña, sin registro público** (ADR-019). |
| **Coste** | **$0/mes.** R2: 10 GB gratis, ~35 MB usados (tarifa 2026-08-03). Pendiente: alerta de gasto. **Criterio:** antes el que APAGA que el que COBRA (`31·L-02`). |
| **Cerebro** | kernel íntegro == canónico (versión → `brain:check`) · bóveda con crudo del comité (477 KB) y fixture de LN-627 |
| **Alcance** | **Plataforma COMPLETA e independiente** (ADR-003): no se integra con Maximo ni SAP. |
| **Deuda crítica** | 🔴 **El DATO de la ficha de los 26 apoyos** (`TODO-57`): la pantalla existe —una a una y por lote—, el dato no; el lote solo trae el tercio de catálogo (`33 · L-59`). 🟡 Dónde deben vivir los datos del empleador (`TODO-58`) · 🟡 **viento y los 1.000 W/m² de la ampacidad siguen ADOPTADOS**: piden serie histórica (`TODO-71`). (ya cerradas: motor sin deuda `40 §8` · ADR-002/003/022/032.) |

## ⚠️ Flags de riesgo activos
- **Repo PÚBLICO** → cero bytes de cliente en git, jamás. La historia de git es permanente (`33 · L-07`); ya cazó una fuga real.
- **El motor puede estar mal y el sistema no fallaría: certificaría.** Riesgo nº 1. Por eso `40 §8` declara qué está verificado y qué no, y **firma el Ingeniero**.
- 🔴 **App Check NO existe** y `CLAUDE.md §1` lo declara «obligatorio desde el día 1». Mientras falte, el sitio público puede llamar a Firebase sin probar que es él. Cierra en `TODO-50 fase 4`.

## 🧩 Sub-sistemas
`nucleo/` ✅ · `exportar/` ✅ (workspace puro, ADR-006/007) · pruebas de oro ✅ · cerebro ✅ · CI ✅ · **pestañas 14/14** ✅ · **capas del mapa** ✅ (ADR-034/037/**046**) · **ONCE atlas del Caribe** ✅ en 3 familias (ADR-045/055/079/081/**086**: 5 medidos de POWER · 3 del satélite · **3 de PRONÓSTICO, declarados como modelo y con caducidad**) · **segmento RCA** ✅ (ADR-020, APARCADO por él) · `evidencias/` (portero de fotos) ✅ **en producción** (ADR-010) · generador de línea ⬜ F2 · base local ⬜ F3 · captura en campo ⬜ F4 · nube ⬜ F5 · mapas offline ⬜ F4+
