# 🩺 05 — ESTADO GLOBAL (Mantenimiento Líneas AT · Heartbeat)

> Signos vitales. **AUTO-CARGA** con `CLAUDE.md` y `10`. Tope ~25 líneas / 4k chars — tablero, no bitácora. Historia → `99`.

| Señal | Valor (al **2026-09-11**) |
|---|---|
| **Misión ahora** | **Llenar la ficha estructural**: el motor dictamina desde julio y siguen **0 de 26** con veredicto, y el lote **no mueve ninguno solo** —faltan las dos alturas (`33 · L-59`). El porqué, abajo en deuda crítica; el pendiente, `TODO-57`. Herramienta INTERNA (`ADR-022`). |
| **Build** | 🟢 `npm test` **3.446 / 0 fail** + reglas 94/94 · contrato **v0.18.0** · motor v0.22.0 · verificado-vivo: 2026-09-20 |
| **Repo** | `main` · https://github.com/PowertransformersMJ/mantenimiento-lineas-at · **PÚBLICO** (decisión del Ingeniero 2026-07-29) · **rama protegida** (24-08): exige el check del CI, sin fuerza ni borrado, **admins exentos** (`ADR-076`) |
| **Producción** | 🟢 **https://mantenimiento-lineas-at.pages.dev** — Cloudflare Pages (`ajimenezp99@gmail.com`). **A mano**: `pull`→`build`→`deploy` (`35 · L-35/77`), y las REGLAS aparte (`35 · L-22`). El parque: **3 líneas** — LN-627 (30 puntos · 26 estructuras · 3.032,8 m, `ADR-054`) y LN-617/LN-628, de alta el 20-09 sobre el **tramo 618**: 28 puntos levantados, sin torres ni conductor (`ADR-133`). El clima, en el Atlas (**ONCE capas**, `10 §3`); la fecha de cada una la dice su JSON (`30 · M-01`). **Parámetros eléctricos: LAS TRES con ene-ago** (`ADR-128/135`) — LN-627 208 días (validada hora a hora el 11-09), LN-617 779 docs y LN-628 767, cargadas el 22-09. · verificado-vivo: 2026-09-20 (hash servido == construido; atlas al día) |
| **Backend** | 🟢 **Dos trabajadores vivos**: el portero de fotos (`evidencias/`, ADR-010) y el de personas (`usuarios/`, ADR-100). **Firestore**; permisos en el token; **DOS cuentas: el propietario y un espectador de solo lectura**; contraseña, sin Google ni registro (ADR-019/100/101). Clave de servicio: bóveda + secreto del Worker (`20 §1`), **rotar antes del 2026-12-05**. **Residencia aceptada, São Paulo** · 🔒 **freno de borrado PUESTO** · ⚠️ sin copia (30-08, `ADR-089`). |
| **Coste** | **$0/mes.** R2: 10 GB gratis, ~35 MB usados (tarifa 03-08). Pendiente: alerta de gasto. **Criterio:** antes el que APAGA que el que COBRA (`31·L-02`). |
| **Cerebro** | kernel íntegro == canónico (versión → `brain:check`) · bóveda con los crudos, el fixture de LN-627 y sus exportaciones de SCADA |
| **Alcance** | **Plataforma COMPLETA e independiente** (ADR-003): no se integra con Maximo ni SAP. |
| **Deuda crítica** | 🔴 **El DATO de la ficha de los 26 apoyos** (`TODO-57`): la pantalla existe —una a una y por lote—, el dato no; el lote solo trae el tercio de catálogo (`33 · L-59`). 🟡 **La ampacidad se PUBLICA pero no se FIRMA**: los 718 A, el viento y los 1.000 W/m² siguen ADOPTADOS (`TODO-95/93/71`). (ya cerradas: motor sin deuda `40 §8` · ADR-002/003/022/032.) |

## ⚠️ Flags de riesgo activos
- **Repo PÚBLICO** → cero bytes de cliente en git, jamás. La historia de git es permanente (`33 · L-07`); ya cazó una fuga real.
- **El motor puede estar mal y el sistema no fallaría: certificaría.** Riesgo nº 1. Por eso `40 §8` declara qué está verificado y qué no, y **firma el Ingeniero**.
- 🔴 **App Check NO está encendido** y `CLAUDE.md §1` lo declara «obligatorio desde el día 1»: sin él, el sitio público llama a Firebase sin probar que es él. Encenderlo es `TODO-61`, suyo y en una consola (`99 §ADR-019/100`).

## 🧩 Sub-sistemas
`nucleo/` ✅ · `exportar/` ✅ (workspace puro, ADR-006/007) · pruebas de oro ✅ · cerebro ✅ · CI ✅ · **pestañas** ✅ · **capas del mapa** ✅ (ADR-034/037/**046**) · **ONCE atlas** ✅ en 3 familias (ADR-045/055/079/081/**086**) · **2 finas del corredor** en esa pantalla (ADR-087) · **parámetros eléctricos** ✅ (ADR-088..131) · **segmento RCA** ✅ (ADR-020, APARCADO por él) · `evidencias/` (portero de fotos) ✅ **en producción** (ADR-010) · generador de línea ⬜ F2 · base local ⬜ F3 · captura en campo ⬜ F4 · nube ⬜ F5 · mapas offline ⬜ F4+
