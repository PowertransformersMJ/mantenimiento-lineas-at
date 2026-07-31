# 📝 10 — MEMORIA DE CORTO PLAZO (pizarra del trabajo vivo)

> Se **AUTO-CARGA**. Es pizarra, no bitácora (§G.3). Tope ~110 líneas / 16k chars.
> **Relevo de sesión 2026-07-31**: la conversación fundadora llegó al tope de contexto y el
> Ingeniero pidió continuar en una nueva. Este nodo ES el relevo — léelo entero antes de tocar nada.

## 🎯 Foco actual — CONTINUAR LAS PESTAÑAS

**4 de 8 pestañas vivas y verificadas** contra el módulo original: Resumen (mapa real +
distribución), Distancias (calculadora + matriz 24×24), Fichas (por punto, GMS idéntico al
original), Mecánico (tramos). **La siguiente es EXPORTAR** (decidido con el Ingeniero):
GPX 1.1, KML y CSV generados **desde los datos, jamás desde la pantalla** (ADR-005) y
verificados contra los exportadores del HTML original. Después: Cantidades (BOM),
Fundamentos, Falla.

## 🧭 Cómo retomar (para la sesión nueva)

1. **Abrir Claude Code DENTRO de `~/Desktop/GitHub-MJ/mantenimiento-lineas-at/`** — así corren
   los hooks del cerebro. Boot: `CLAUDE.md` + `05` + `10` + `brain:check`.
2. Producción: **https://mantenimiento-lineas-at.pages.dev** · repo
   `PowertransformersMJ/mantenimiento-lineas-at` (público → cero bytes de cliente, L-07).
3. Sesiones YA autenticadas en esta Mac: `gh` (GitHub) · `wrangler` (Cloudflare, cuenta
   ajimenezp99) · `firebase` (proyecto `mantenimiento-lineas-at`, Firestore en
   southamerica-east1). Desplegar: `npm run build && npm run deploy --workspace web`.
4. La llave de administrador de Firebase está en la carpeta de Descargas del Ingeniero (nombre
   exacto → nota operativa en la bóveda `../brain-private/mantenimiento-lineas-at/`). Sirve
   para sembrar datos y usuarios de prueba (patrón: `pruebaN@mantenimiento-lineas-at.test`
   con claims `{orgId:'transpower', rol:'admin'}` vía token custom, **verificar en el panel de
   vista previa —visible— y BORRARLO al terminar**; queda solo ajimenezp99@gmail.com admin).
5. Verificación visual: el panel de vista previa SÍ pinta; la pestaña de Chrome controlada por
   herramientas puede estar oculta y **congela el mapa** (L-16) — no diagnosticar ahí.
6. Antes de CADA push: auditoría de coordenadas/secretos + `npm test` (59) +
   `contrato:verificar` + `brain:check`. Documentar TODO fallo en `30` ANTES de commitear —
   orden expresa del Ingeniero: *"nunca olvides documentar todo, sobre todo los errores o
   fallos, para que no se repitan nunca más"*. Y: *"vamos a darle un máximo nivel"*.

## 🔲 Pendientes del INGENIERO

| # | Qué | Por qué bloquea |
|---|---|---|
| **TODO-02** | Enviar a AFINIA las **7 preguntas** (`99 §ADR-001`; la nº 2 la cerró ADR-003) | La 3 decide si F4 existe; la 4 decide F5/F6; la 1 define el entregable |
| **TODO-03** | Cronometrar el proceso actual de LN-627 (20 min) | Sin eso el ahorro prometido es inventado |
| **TODO-04** | Abrir el HTML en el teléfono de cuadrilla en modo avión: ¿mapa gris? | Confirma L-10 en vivo |
| **TODO-05** | Decidir por escrito qué NO se mide de la persona | Sin eso el piloto mide adopción falsa |
| **TODO-06** | ¿Existen el GPX crudo del Garmin y las fotos originales en la Mac? | Definen la fuente del generador |

## 🔲 Pendientes de CLAUDE

| # | Qué | Estado |
|---|---|---|
| **TODO-19** | **Pestaña EXPORTAR**: GPX 1.1/KML/CSV desde datos, verificados contra los del módulo original (formatos en el propio HTML: `dl()`, cabeceras `sep=;`) | 🔜 SIGUIENTE |
| **TODO-20** | Pestañas Cantidades (BOM) → Fundamentos → Falla | 🔲 en ese orden |
| **TODO-11** | **F1 · Nota técnica LN-627** — con las correcciones de la auditoría (`99`): viento 130 km/h región 5, límite RETIE 25 % sin carga, fluencia, gálibos por categoría | 🔲 |
| **TODO-10** | Confirmar contra qué hipótesis compara el despeje el módulo original | 🔲 |
| **TODO-12** | Margen real de almacenamiento con la mezcla del parque | 🔲 tras TODO-02 |
| **TODO-13** | F3: invalidación por tramo al editar un apoyo (ADR-002 e.3) | 🔲 |
| **TODO-14** | F4: sincronización bifurcada + `base_revision_id` con cuarentena (ADR-002 e.1-2) | 🔲 |
| **TODO-15** | Al entrar en F5: reabrir Firestore vs D1 con datos reales (ADR-002/003) | 🔲 condicional |
| **TODO-16** | Alerta de presupuesto ANTES de tráfico real (ADR-003) | 🔲 antes de F5 |
| **TODO-21** | Semana 2 de ADR-004: flujo de IA completo con `ProveedorFalso` (0 tokens, sin papeles) | 🔲 tras pestañas |
| **TODO-22** | Prueba de navegador con captura vs referencia (el "revisor que no tenemos", ADR-005) | 🔲 |
| **TODO-23** | Secretos `CLOUDFLARE_API_TOKEN`/`ACCOUNT_ID` en GitHub → despliegue automático | 🔲 con el Ingeniero |

## ✅ Estado consolidado (detalle → ADR-001…005 y los commits)

- **Producción viva** con datos reales de LN-627 leídos tras login Google (popup + redirección).
- **Modelo corregido**: 24 estructuras + 2 empalmes (NO son apoyos), 23 vanos, VIR 198,20 m,
  tramos 1-2-2-14-1-3, nombres canónicos ↔ GPS crudo conviviendo (`40 §10`).
- **Motor sin deuda**: cambio de estado validado por identidad física; vano peso derivado con
  detección de arrancamiento; estadísticas que reproducen el panel original. **59 pruebas.**
- **Mapa**: MapLibre + PMTiles 100 % autohospedado (Cartagena metro, 4,3 MB, archivo completo
  en memoria porque Pages no honra rangos). Satelital deshabilitada: licencia por verificar.
- **Auditoría adversarial de la nota técnica** (crudos en la bóveda): viento real 130 km/h
  (región 5), límite RETIE = 25 % de rotura sin carga (el 50 % no existe en RETIE), sin
  fluencia la flecha real es 10,4–11,2 m, los 7,0 m de despeje no corresponden a 66 kV, el GPS
  de mano no es firmable, y el tramo crítico es el 5 (13,4 m), no el 6. **Nada de esto está
  resuelto: está DOCUMENTADO y espera la ficha del proveedor + topografía real.**
- **Cerebro**: 16 lecciones (L-01…L-16) — LEERLAS antes de tocar Firebase, mapas o despliegues.

## 🚫 Callejones ya probados (no repetir — detalle en `30`)

- `node --test tests/` sin patrón entrecomillado → suite sin correr, sin aviso.
- Leer credenciales del llavero → bloqueado por el clasificador; `gh auth login` fue el camino.
- Caché persistente de Firestore/Auth en IndexedDB → "Database is closing/hidden" (L-11/L-11b).
- `initializeAuth` sin `popupRedirectResolver` → `auth/argument-error` (L-13).
- Worker de MapLibre por defecto en producción → mudo; `?worker&url` + `setWorkerUrl` (L-15).
- Diagnosticar el mapa en pestaña oculta → RAF congelado, todo parece roto (L-16).
- PMTiles por rangos contra Pages → responde 200 completo; va el archivo entero a memoria.
