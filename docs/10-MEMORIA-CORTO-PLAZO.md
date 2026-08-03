# 📝 10 — MEMORIA DE CORTO PLAZO (pizarra del trabajo vivo)

> Se **AUTO-CARGA**. Es pizarra, no bitácora (§G.3). Tope ~110 líneas / 16k chars.
> **RELEVO DE SESIÓN 2026-08-03** — la conversación anterior llegó al tope de contexto.
> Este nodo ES el relevo: léelo entero antes de tocar nada. Si contradice a
> `docs/.handoff-auto.md` (foto real de git), manda ese.

## 🎯 Dónde estamos

**11 pestañas vivas**: Resumen · Distancias · Fichas · **Falla** · Fundamentos · Mecánico ·
Térmica · Viento · **Cargas** (los DOS ejes) · Cantidades · Exportar. **597 pruebas** en verde.
Producción al día y **verificada en pantalla**, no solo por hash.

**La auditoría está cerrada (ADR-014).** Los 20 hallazgos de la ola 4, resueltos. Lo último en
entrar: la deflexión con **un solo dueño** (manda la geodésica — no mueve ningún número de LN-627,
comprobado: los 24 ángulos guardados coinciden dentro de 0,005°), el informe ya no atribuye el tope
de tiro a una hipótesis que no lo declara, el CSV no le entrega fórmulas a Excel, y el **portero
tiene sus primeras 14 pruebas** — estaba en producción sirviendo fotos de cliente sin ninguna.

**Las fotos ya se sirven.** R2 activo ($0/mes), depósito privado, portero desplegado en
`lineas-at-evidencias.ajimenezp99.workers.dev`, y las 4 del expediente de LN-627 cargando en la
galería. Verificado que un desconocido NO puede bajarlas (ADR-010).

## 🛑 LO PRIMERO AL RETOMAR

1. **El tope de tiro sigue sin decidir (TODO-33).** Es el único bloqueo original que queda.
   **Novedad (ADR-014):** `tiroAdmisible_pct` y `criterioTiroQueRige` YA existen en el contrato —
   antes `umbrales.js` los leía y el esquema no los admitía, así que su decisión no tenía por dónde
   entrar y el tope valía 50 % pasara lo que pasara. Ahora entra declarándolos en la hipótesis.
   **Los números NO han cambiado.** Ojo: `vistas/tramos.ts`, `vientoDatos.ts` y `Fundamentos.tsx`
   siguen leyendo `tiroMaximoAdmisible()` = 0,5·RTS fijo en código — unificarlo al cerrar la decisión.
2. **La alerta de presupuesto de Cloudflare (TODO-44), del Ingeniero.** R2 no apaga: factura. Hoy
   son 18 MB de 10 GB gratis, así que el riesgo es teórico — pero la regla del proyecto es que
   ninguna pieza tenga gasto ilimitado. `+ Add Budget Alert` en Workers & Pages; sugerido 1 USD.

## 🧭 Cómo retomar

1. **Abrir Claude Code DENTRO de `~/Desktop/GitHub-MJ/mantenimiento-lineas-at/`.** Desde el paraguas
   el gate bloquea el commit por canario de boot (remedio: `node scripts/session-handoff.mjs --boot-echo`,
   y el mensaje que da es engañoso: dice «presupuesto de boot excedido» cuando es el canario).
2. Producción **https://mantenimiento-lineas-at.pages.dev** · repo público → **cero bytes de
   cliente, incluidas las pruebas** (`L-23`). Desplegar: `npm run build && npm run deploy --workspace web`.
3. **Verificar contra PRODUCCIÓN con el Chrome del Ingeniero** y **preguntarle a la pestaña qué
   bundle cargó** — `curl` prueba el borde, el navegador tiene su propia caché (`L-18`, tres cachés
   en serie). Esta sesión verificó dos veces una pantalla vieja por saltarse esto.
4. Antes de CADA push: auditoría de coordenadas + `npm test` (597) + `contrato:verificar` +
   `brain:check`. Documentar TODO fallo en `30` ANTES de commitear.
5. Autenticado en esta Mac: `gh`, `wrangler` (cuenta ajimenezp99), `firebase`. Llave admin de
   Firebase en Descargas. Cuenta Cloudflare `ecc6a431234e4ef7f57f36a022ebff8f`.

## 🔲 Pendientes del INGENIERO

| # | Qué | Por qué importa |
|---|---|---|
| **TODO-33** | **Decidir 50 % o 25 % de RTS** como tope de tiro | Hoy el motor calcula con 50 % y la doctrina dice 25 % |
| **TODO-44** | **Alerta de presupuesto** en Cloudflare (sugerido 1 USD) | R2 no apaga: factura |
| **TODO-34** | **Respaldo de la bóveda**: sin remoto. 337 MB con un archivo de 110 MB que GitHub rechaza. Opciones: repo privado excluyendo ese bundle · disco externo · dejarlo en la Mac | Ahí viven las 103 fotos, los fixtures y todos los crudos |
| **TODO-02** | Enviar a AFINIA las **7 preguntas** (`99 §ADR-001`) | La 3 decide si F4 existe; la 4 decide F5/F6 |
| **TODO-03** | Cronometrar el proceso actual de LN-627 (20 min) | Sin eso el ahorro prometido es inventado |
| **TODO-25** | Probar con su sesión: descargas, Fundamentos, popup, Salir | El clasificador bloquea el usuario de prueba (`L-17`) |
| **TODO-36** | **Fichas editable** (hecho fechado, no sobrescritura): DECISIÓN FUERTE — modelo de datos + escritura a Firestore + reglas. Se propone como ADR, no se implementa a ciegas | Es el mayor hueco de paridad que queda |

## 🔲 Pendientes de CLAUDE — por dónde seguir, en este orden

| # | Qué | Dónde está el plan |
|---|---|---|
| **TODO-43** | Las **99 fotos por estructura**. R2 ya está vivo; falta el vínculo `apoyoId` en `Evidencia`, en el subidor y en la ficha. **Si el nombre del archivo no basta para asignarlas, NO se suben**: mal asignadas son peores que ausentes | crudo de **ADR-013** |
| **TODO-41** | Alta ADITIVA en el contrato: `capacidadLongitudinal {valor_kgf, tipo, alturaReferencia_m, fuente}`. Sin ella NINGÚN apoyo tiene veredicto en el eje longitudinal | **ADR-012** |
| **TODO-42/37** | **Informe gerencial** del expediente (10 secciones especificadas) | crudo de **ADR-012** |
| **TODO-30** | CI: validación XSD real de GPX/KML (xmllint + esquemas versionados en el repo) | crudo de **ADR-013** |
| **TODO-46** | **Shard del nodo 30 — ya BLOQUEA**: 34 lecciones, **385 líneas de 350**, y el tope duro está en 385. `L-34` entró destilada al límite; **la próxima lección no cabe** y pondrá `brain:check` en rojo, que bloquea el commit. Partirlo por tema toca `CLAUDE.md §0`, el manifiesto y el índice: es arquitectura del cerebro, no poda | — |
| **TODO-11** | F1 · Nota técnica LN-627 con las correcciones de la auditoría | — |
| **TODO-13/14/15/16/21/22/23** | F3-F5: invalidación por tramo · sincronización bifurcada · Firestore vs D1 · flujo IA con `ProveedorFalso` · prueba de navegador · secretos para despliegue automático | — |

## ✅ Consolidado (detalle → ADR-001…014)

- **Modelo**: 24 estructuras + 2 empalmes (NO son apoyos), 23 vanos, tramos 1-2-2-14-1-3 (`40 §10`).
- **Workspaces**: `nucleo/` (geodesia, mecánica, térmica, estadísticas, vanos, umbrales, cantidades,
  coherencia, **cargas**, **longitudinal**) · `contratos/` (v0.2.0) · `exportar/` (+ mecanica de 5
  secciones, informe de 11) · `web/` · `evidencias/` (Worker, **en producción**).
- **Hallazgos de ingeniería reales**: 14 de 23 vanos fuera de la banda 0,7–1,3 del VIR · parábola
  admisible aquí (−0,100 %) · **3 apoyos amplifican la tensión** (E06 ×1,726 = 73 % más) ·
  **los 2 terminales soportan el tiro entero** (2.339 kgf/conductor), un orden por encima de
  cualquier desequilibrio.
- **Deuda declarada**: fluencia · vano peso (falta cota de sujeción) · despeje al terreno · ficha
  real del proveedor · **ningún apoyo tiene veredicto en el eje longitudinal** (falta TODO-41).
- **Cerebro**: 34 lecciones (L-01…L-34). El nodo 30 está EN el tope duro: ver TODO-46.

## 🚫 Callejones ya probados (no repetir — detalle en `30`)

- Desplegar código sin desplegar `firestore.rules` → el dato existe y no llega (`L-22`).
- Dar por verificada una pantalla porque `curl` ve el hash nuevo: el navegador sirve su caché y
  `?recarga=N` no la rompe (`L-18`). Preguntarle a la pestaña qué cargó.
- Duplicar una lista de dominio sin su guardián: `ANCLAN` divergió y publicó cero carga en el
  informe firmable (`L-19`, `99 §ADR-013`).
- Guardias que cuentan INTENTOS en vez de resultados, y `x ?? 0`, que convierte «no se sabe» en
  «vale cero» (`L-32`).
- `loading="lazy"` con URL `blob:`: la imagen nunca carga y se lee como «faltan los datos» (`L-30`).
- Creer que `npm test` verde prueba que hay pruebas (`L-24`) o que las que hay miden lo correcto
  (`L-33`: 564 en verde y la auditoría encontró 9 fallos) o que un fixture que DECLARA lo que producción deriva ensaya el camino real (`L-34`).
