# 📝 10 — MEMORIA DE CORTO PLAZO (pizarra del trabajo vivo)

> Se **AUTO-CARGA**. Es pizarra, no bitácora (§G.3). Tope ~110 líneas / 16k chars.
> **RELEVO DE SESIÓN 2026-08-01** — la conversación anterior llegó al tope de contexto.
> Este nodo ES el relevo: léelo entero antes de tocar nada.

## 🎯 Dónde estamos

**10 pestañas vivas**: Resumen · Distancias · Fichas · **Falla** · Fundamentos · Mecánico ·
**Térmica** · **Viento** · **Cantidades** · Exportar. **445 pruebas** en verde. Producción al día.

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
| **TODO-32** | **Completar el alta de R2** (tarjeta + dirección + 2 casillas) | Desbloquea las 103 fotos y el informe fotográfico |
| **TODO-33** | **Decidir 50 % o 25 % de RTS** como tope de tiro | Hoy el motor calcula con 50 % y la doctrina dice 25 % |
| **TODO-34** | **Respaldo de la bóveda**: no tiene remoto. 337 MB, con un archivo de 110 MB (`sgm-transpower/confidencial-retirado/*.bundle`) que **GitHub rechaza** (tope 100 MB/archivo). Opciones: repo privado excluyendo ese bundle · copia a disco externo (no había ninguno montado) · dejarlo solo en la Mac | Ahí viven las 103 fotos, los fixtures y todos los crudos |
| **TODO-02** | Enviar a AFINIA las **7 preguntas** (`99 §ADR-001`) | La 3 decide si F4 existe; la 4 decide F5/F6 |
| **TODO-03** | Cronometrar el proceso actual de LN-627 (20 min) | Sin eso el ahorro prometido es inventado |
| **TODO-25** | Probar con su sesión: descargas, Fundamentos, popup, Salir | El clasificador bloquea el usuario de prueba (`L-17`) |

## 🔲 Pendientes de CLAUDE (ola 3)

| # | Qué | Estado |
|---|---|---|
| **TODO-35** | Al habilitarse R2: depósito + desplegar `evidencias/` + `VITE_EVIDENCIAS_URL` + subir fotos + verificar la galería en producción | 🔜 en cuanto TODO-32 |
| **TODO-36** | **Fichas editable** (hecho fechado, no sobrescritura) + las 99 fotos por estructura + los ~26 campos del contrato que aún no se pintan | 🔲 el mayor hueco restante (paridad 25 %) |
| **TODO-37** | **Informe gerencial** del expediente (control documental, riesgo residual, recomendaciones) — inventariado en el crudo de ADR-009 | 🔲 |
| **TODO-38** | Cargas sobre estructuras EN PANTALLA: `nucleo/cargas.js` existe y está probado, pero ninguna vista lo llama | 🔲 bajo esfuerzo, alto valor |
| **TODO-30** | CI: validación XSD real de GPX/KML (xmllint + esquemas en el repo) | 🔲 |
| **TODO-11** | F1 · Nota técnica LN-627 con las correcciones de la auditoría | 🔲 |
| **TODO-13/14/15/16/21/22/23** | F3-F5: invalidación por tramo · sincronización bifurcada · Firestore vs D1 · alerta de presupuesto · flujo IA con `ProveedorFalso` · prueba de navegador · secretos para despliegue automático | 🔲 |

## ✅ Consolidado (detalle → ADR-001…010)

- **Modelo**: 24 estructuras + 2 empalmes (NO son apoyos), 23 vanos, tramos 1-2-2-14-1-3 (`40 §10`).
- **Workspaces**: `nucleo/` (geodesia, mecánica, térmica, estadísticas, vanos, umbrales,
  cantidades, coherencia, cargas) · `contratos/` (10 colecciones) · `exportar/` (levantamiento,
  gpx, kml, csv, calidad, procedencia, mecanica, bom, informe) · `web/` · `evidencias/` (Worker).
- **Hallazgos de ingeniería nuevos, reales**: 14 de 23 vanos fuera de la banda 0,7–1,3 del VIR
  (sobre todo el tramo 4) · control catenaria/parábola −0,100 % en el vano peor → la parábola
  ES admisible aquí · un apoyo con 118° de deflexión (factor 1,72: recibe más carga que la
  propia tensión).
- **Deuda declarada, no resuelta**: fluencia, vano peso (falta cota de sujeción), despeje al
  terreno, ficha real del proveedor del conductor.
- **Cerebro**: 25 lecciones (L-01…L-25). Leer antes de tocar Firebase, mapas, despliegues o
  workflows con agentes.

## 🚫 Callejones ya probados (no repetir — detalle en `30`)

- Desplegar código sin desplegar `firestore.rules` → el dato existe y no llega (`L-22`).
- Creer que un `npm test` verde prueba que hay pruebas: un agente caído deja módulos sin
  validar y el contador sube igual (`L-24`).
- Aclarar el tema por «se ve oscuro»: el original TAMBIÉN es oscuro; era densidad (`L-21`).
- Arneses que inyectan en el almacén y montan un segundo React → «Invalid hook call».
- Diagnosticar el mapa en pestaña oculta → reloj congelado (`L-16`).
- `node --test tests/` sin patrón entrecomillado → suite sin correr, sin aviso.
