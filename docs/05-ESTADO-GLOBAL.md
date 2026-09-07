# 🩺 05 — ESTADO GLOBAL (Mantenimiento Líneas AT · Heartbeat)

> Signos vitales. **AUTO-CARGA** con `CLAUDE.md` y `10`. Tope ~25 líneas / 4k chars — tablero, no bitácora. Historia → `99`.

| Señal | Valor (al **2026-09-06**) |
|---|---|
| **Misión ahora** | **Llenar la ficha estructural.** El motor dictamina desde julio y siguen **0 de 26** con veredicto: la pantalla existe, una a una y por lote (`99 §ADR-030/038`), pero el lote solo trae el tercio de catálogo y **no mueve ningún veredicto solo**: faltan las dos alturas (`33 · L-59`). `TODO-57`: ¿están en planos y actas, o hay que levantarlas? Herramienta INTERNA (`ADR-022`). Pendientes → `10`. |
| **Build** | 🟢 `npm test` **2.536 / 0 fail** + emulador 59/59 · contrato exit 0, **v0.15.0** · motor v0.13.0 · verificado-vivo: 2026-09-06 |
| **Repo** | `main` · https://github.com/PowertransformersMJ/mantenimiento-lineas-at · **PÚBLICO** (decisión del Ingeniero 2026-07-29) · **rama protegida** (24-08): exige el check del CI, sin fuerza ni borrado, **admins exentos** (`ADR-076`) |
| **Producción** | 🟢 **https://mantenimiento-lineas-at.pages.dev** — Cloudflare Pages (`ajimenezp99@gmail.com`). **A mano**, `build` delante: `deploy` NO construye (`35 · L-35`). La línea: **30 puntos · 26 estructuras · 3.032,8 m** (`ADR-054`). El clima vive en el Atlas, con **el trazado** y **de cuándo es el dato** (`ADR-055..087`): **ONCE capas** en 3 familias (`ADR-079/081/086`) y **la fecha de cada una la dice su propio JSON** — aquí no se copia (`30 · M-01`). · verificado-vivo: 2026-09-06 (hash servido == construido; CSP sin Google) |
| **Backend** | 🟢 **Dos trabajadores vivos**: el portero de fotos (`evidencias/`, ADR-010) y el de personas (`usuarios/`, ADR-100). **Firestore**; permisos en el token; **DOS cuentas: el propietario y un espectador de solo lectura**; contraseña, sin Google ni registro (ADR-019/100/101). Clave de servicio: bóveda + secreto del Worker (`20 §1`), **rotar antes del 2026-12-05**. **Residencia aceptada, São Paulo** · 🔒 **freno de borrado PUESTO** · ⚠️ sin copia (30-08, `ADR-089`). |
| **Coste** | **$0/mes.** R2: 10 GB gratis, ~35 MB usados (tarifa 03-08). Pendiente: alerta de gasto. **Criterio:** antes el que APAGA que el que COBRA (`31·L-02`). |
| **Cerebro** | kernel íntegro == canónico (versión → `brain:check`) · bóveda con el crudo del comité y el fixture de LN-627 |
| **Alcance** | **Plataforma COMPLETA e independiente** (ADR-003): no se integra con Maximo ni SAP. |
| **Deuda crítica** | 🔴 **El DATO de la ficha de los 26 apoyos** (`TODO-57`): la pantalla existe —una a una y por lote—, el dato no; el lote solo trae el tercio de catálogo (`33 · L-59`). 🟡 **viento y los 1.000 W/m² de la ampacidad siguen ADOPTADOS**: piden serie histórica (`TODO-71`). (ya cerradas: motor sin deuda `40 §8` · ADR-002/003/022/032.) |

## ⚠️ Flags de riesgo activos
- **Repo PÚBLICO** → cero bytes de cliente en git, jamás. La historia de git es permanente (`33 · L-07`); ya cazó una fuga real.
- **El motor puede estar mal y el sistema no fallaría: certificaría.** Riesgo nº 1. Por eso `40 §8` declara qué está verificado y qué no, y **firma el Ingeniero**.
- 🔴 **App Check NO existe** y `CLAUDE.md §1` lo declara «obligatorio desde el día 1». Mientras falte, el sitio público puede llamar a Firebase sin probar que es él. Cierra en `TODO-50` (`99 §ADR-019`).

## 🧩 Sub-sistemas
`nucleo/` ✅ · `exportar/` ✅ (workspace puro, ADR-006/007) · pruebas de oro ✅ · cerebro ✅ · CI ✅ · **pestañas** ✅ · **capas del mapa** ✅ (ADR-034/037/**046**) · **ONCE atlas** ✅ en 3 familias (ADR-045/055/079/081/**086**: 5 POWER · 3 satélite · **3 de PRONÓSTICO, modelo y con caducidad**) · **2 finas del corredor** en esa pantalla (ADR-087) · **segmento RCA** ✅ (ADR-020, APARCADO por él) · `evidencias/` (portero de fotos) ✅ **en producción** (ADR-010) · generador de línea ⬜ F2 · base local ⬜ F3 · captura en campo ⬜ F4 · nube ⬜ F5 · mapas offline ⬜ F4+
