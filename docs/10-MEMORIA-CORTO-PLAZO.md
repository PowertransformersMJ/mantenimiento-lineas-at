# 📝 10 — MEMORIA DE CORTO PLAZO (pizarra del trabajo vivo)

> Se **AUTO-CARGA**. Es pizarra, no bitácora (§G.3). Tope ~110 líneas / 16k chars.
> **Última sesión: 2026-08-01 (tarde).** Cerrados TODO-38, TODO-39, TODO-40 y la parte ejecutable
> de TODO-36: la pestaña Cargas con sus DOS ejes (ADR-011/012), su salida al informe y a los
> exportes, y la ficha del apoyo ampliada. Cinco defectos cazados verificando en PRODUCCIÓN, no en
> local. Los dos bloqueos del Ingeniero siguen igual.

## 🎯 Dónde estamos

**11 pestañas vivas**: Resumen · Distancias · Fichas · **Falla** · Fundamentos · Mecánico ·
**Térmica** · **Viento** · **Cargas** · **Cantidades** · Exportar. **564 pruebas** en verde.
Producción al día (verificada en el navegador, no solo por hash — ver `L-18`, segundo punto ciego).

La migración del módulo de campo original está cerrada en sus P0. El inventario de brechas
(ADR-009, 8 auditores) contaba 79 faltantes; quedan ~48 de prioridad P1/P2 con receta escrita
en el crudo de la bóveda.

## 🛑 LO PRIMERO AL RETOMAR: dos cosas están a medias y son del Ingeniero

1. **R2 sin habilitar.** Se pulsó «Add R2 subscription» y el paso siguiente pide **tarjeta y
   dirección de facturación** — Claude NO rellena datos de pago, ni autorizado (`30 · L-25`).
   Comprobar con `npx wrangler r2 bucket list`. **Cuando responda**, en este orden:
   ```
   npx wrangler r2 bucket create lineas-at-evidencias
   cd evidencias && npx wrangler deploy          # el portero; anota su URL
   # añadir VITE_EVIDENCIAS_URL=<url del worker> al build de web/ y redesplegar
   GOOGLE_APPLICATION_CREDENTIALS=~/Downloads/mantenimiento-lineas-at-firebase-adminsdk-fbsvc-6f767a0725.json \
     node herramientas/subir-evidencias.mjs --linea LN-627 --origen falla
   ```
   Todo lo demás del pipeline ya está construido y probado (ADR-010).
2. **El tope de tiro: 50 % clásico o 25 % del RETIE sin carga externa.** El umbral salió del
   código a las hipótesis (`hipotesis.tiroAdmisible_pct`); la tabla de Umbrales muestra AMBOS y
   el segundo queda «no evaluable» hasta que el Ingeniero declare `criterioTiroQueRige`.
   **Los números NO han cambiado.** Ojo: `vistas/tramos.ts` sigue leyendo `tiroMaximoAdmisible()`
   = 0,5·RTS de `mecanica.js` — unificarlo al cerrar la decisión.

## 🧭 Cómo retomar

1. **Abrir Claude Code DENTRO de `~/Desktop/GitHub-MJ/mantenimiento-lineas-at/`** (si no, el
   gate del cerebro bloquea el commit por canario de boot; remedio:
   `node scripts/session-handoff.mjs --boot-echo`). Boot: `CLAUDE.md` + `05` + `10` + `brain:check`.
2. Producción **https://mantenimiento-lineas-at.pages.dev** · repo público
   `PowertransformersMJ/mantenimiento-lineas-at` → **cero bytes de cliente, incluidas las
   pruebas** (`L-23`). Desplegar: `npm run build && npm run deploy --workspace web`, y **esperar
   propagación comparando el hash del bundle** (`L-18`) antes de decir que está vivo.
3. Autenticado en esta Mac: `gh`, `wrangler` (cuenta ajimenezp99), `firebase`. Llave admin de
   Firebase en Descargas (nombre en la nota operativa de la bóveda).
4. **Verificar contra PRODUCCIÓN con el Chrome del Ingeniero**, no con arneses locales: el
   sitio exige login y el arnés de inyección en el almacén rompe el árbol de React. Si el panel
   de vista previa está oculto, el mapa se congela y todo parece roto (`L-16`).
5. Antes de CADA push: auditoría de coordenadas (`grep -rnE '\b10\.3[45][0-9]{4}\b|\b-?75\.4[89][0-9]{4}\b'`)
   + `npm test` (445) + `contrato:verificar` + `brain:check`. Documentar TODO fallo en `30`
   ANTES de commitear — orden expresa: *"que no se repitan nunca más"*. Y: *"máximo nivel"*.

## 🔲 Pendientes del INGENIERO

| # | Qué | Por qué importa |
|---|---|---|
| **TODO-33** | **Decidir 50 % o 25 % de RTS** como tope de tiro | Hoy el motor calcula con 50 % y la doctrina dice 25 % |
| **TODO-34** | **Respaldo de la bóveda**: no tiene remoto. 337 MB, con un archivo de 110 MB (`sgm-transpower/confidencial-retirado/*.bundle`) que **GitHub rechaza** (tope 100 MB/archivo). Opciones: repo privado excluyendo ese bundle · copia a disco externo (no había ninguno montado) · dejarlo solo en la Mac | Ahí viven las 103 fotos, los fixtures y todos los crudos |
| **TODO-02** | Enviar a AFINIA las **7 preguntas** (`99 §ADR-001`) | La 3 decide si F4 existe; la 4 decide F5/F6 |
| **TODO-03** | Cronometrar el proceso actual de LN-627 (20 min) | Sin eso el ahorro prometido es inventado |
| **TODO-25** | Probar con su sesión: descargas, Fundamentos, popup, Salir | El clasificador bloquea el usuario de prueba (`L-17`) |

## 🔲 Pendientes de CLAUDE (ola 3)

| # | Qué | Estado |
|---|---|---|
| **TODO-36** | **Fichas editable** (hecho fechado, no sobrescritura) — es DECISIÓN FUERTE: modelo de datos + escritura a Firestore + reglas. Se propone como ADR, no se implementa a ciegas | 🔲 espera decisión del Ingeniero |
| **TODO-43** | Las **99 fotos por estructura**: R2 ya está vivo, pero `subir-evidencias.mjs` las colgaría de la LÍNEA, no de cada apoyo. Falta el vínculo `apoyoId` en el subidor y en la ficha | 🔲 |
| **TODO-44** | Poner la **alerta de presupuesto** en Cloudflare (`+ Add Budget Alert` en Workers & Pages). R2 no apaga: factura. Con 18 MB de 10 GB el riesgo es teórico, pero la regla del proyecto es que ninguna pieza tenga gasto ilimitado | 🔲 del Ingeniero |
| **TODO-41** | Alta ADITIVA en el contrato de `capacidadLongitudinal {valor_kgf, tipo, alturaReferencia_m, fuente}`: sin ella NINGÚN apoyo tiene veredicto en el eje longitudinal | 🔲 sigue a ADR-012 |
| **TODO-42** | **Informe gerencial** — el workflow dejó su especificación (10 secciones) en el crudo de ADR-012 | 🔲 |
| **TODO-37** | **Informe gerencial** del expediente (control documental, riesgo residual, recomendaciones) — inventariado en el crudo de ADR-009 | 🔲 |
| **TODO-46** | **Shard del nodo 30**: 33 lecciones, 378 líneas sobre un tope de 350. Se ha destilado ~75 líneas en dos sesiones y sigue creciendo. Partirlo por tema (proveedores · dominio · proceso) toca `CLAUDE.md §0`, el manifiesto y el índice: es cambio de arquitectura del cerebro, no poda | 🔲 |
| **TODO-45** | **11 hallazgos MENORES de la auditoría** (ADR-013): el informe publica la carga ya multiplicada junto a la fórmula «por conductor» · el semáforo de utilización sin umbral ni fuente · celdas CSV que Excel evalúa como fórmula · `levSeguro` fabrica `longitud_m: 0`. Detalle en el crudo | 🔲 |
| **TODO-30** | CI: validación XSD real de GPX/KML (xmllint + esquemas en el repo) — el plan está en el crudo de ADR-013 | 🔲 |
| **TODO-11** | F1 · Nota técnica LN-627 con las correcciones de la auditoría | 🔲 |
| **TODO-13/14/15/16/21/22/23** | F3-F5: invalidación por tramo · sincronización bifurcada · Firestore vs D1 · alerta de presupuesto · flujo IA con `ProveedorFalso` · prueba de navegador · secretos para despliegue automático | 🔲 |

## ✅ Consolidado (detalle → ADR-001…010)

- **Modelo**: 24 estructuras + 2 empalmes (NO son apoyos), 23 vanos, tramos 1-2-2-14-1-3 (`40 §10`).
- **Workspaces**: `nucleo/` (geodesia, mecánica, térmica, estadísticas, vanos, umbrales,
  cantidades, coherencia, cargas) · `contratos/` (10 colecciones) · `exportar/` (levantamiento,
  gpx, kml, csv, calidad, procedencia, mecanica, bom, informe) · `web/` · `evidencias/` (Worker).
- **Hallazgos de ingeniería nuevos, reales**: 14 de 23 vanos fuera de la banda 0,7–1,3 del VIR
  (sobre todo el tramo 4) · control catenaria/parábola −0,100 % en el vano peor → la parábola
  ES admisible aquí · **tres apoyos amplifican la tensión** (E02 ×1,070 · E20 ×1,232 · **E06 ×1,726,
  o sea 73 % más carga transversal que el propio tiro, siempre**) → pestaña Cargas, ADR-011.
- **Deuda declarada, no resuelta**: fluencia, vano peso (falta cota de sujeción), despeje al
  terreno, ficha real del proveedor del conductor.
- **Cerebro**: 33 lecciones (L-01…L-33). Leer antes de tocar Firebase, mapas, despliegues o
  workflows con agentes.

## 🚫 Callejones ya probados (no repetir — detalle en `30`)

- Desplegar código sin desplegar `firestore.rules` → el dato existe y no llega (`L-22`).
- Creer que un `npm test` verde prueba que hay pruebas: un agente caído deja módulos sin
  validar y el contador sube igual (`L-24`).
- Aclarar el tema por «se ve oscuro»: el original TAMBIÉN es oscuro; era densidad (`L-21`).
- Arneses que inyectan en el almacén y montan un segundo React → «Invalid hook call».
- Diagnosticar el mapa en pestaña oculta → reloj congelado (`L-16`).
- `node --test tests/` sin patrón entrecomillado → suite sin correr, sin aviso.
- Dar por verificada una pantalla porque `curl` ve el hash nuevo: el NAVEGADOR sirve su propia
  caché y `?recarga=N` no la rompe (`L-18`). Preguntarle a la pestaña qué cargó.
- Pintar tal cual una nota que el núcleo escribe por fila → 24 párrafos idénticos (`L-27`).
