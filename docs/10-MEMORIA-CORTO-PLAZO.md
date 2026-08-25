# 📝 10 — MEMORIA DE CORTO PLAZO (pizarra viva)

> Se **AUTO-CARGA**. Pizarra, no bitácora (§G.3). **RELEVO 2026-08-24.** Este nodo ES el relevo:
> léelo entero. Si contradice a `docs/.handoff-auto.md` (foto real de git), manda ese.

## 🎯 Dónde estamos

**Cifras en `05`.** 14 pestañas + RCA + tres informes. Olas cerradas: ADR-018 · 020-024 · 032 ·
034-042 · 043-045 · **046-056**. Todo EN PRODUCCIÓN y **verificado en vivo con su sesión**.

> 🧭 **SE VA POR FASES, orden suya (22-08).** El **módulo RCA sigue APARCADO** —lo cerrado ahí es
> `§ADR-049/050`—. La fase viva es **la página**.

## 🛑 LO PRIMERO AL RETOMAR
1. **EL CUELLO DE BOTELLA NO ES CÓDIGO: ES EL DATO**: 0 de 26 con veredicto (`TODO-57`).
2. **EL PATRÓN QUE LO DOMINA TODO:** *«arreglado donde se veía, vivo en la pieza hermana»* —
   `34 · L-65`, `32 · L-67`, `30 · L-68`, `30 · M-01`. Volvió a morder el 24-08 (`§ADR-078`): el
   hora a hora funcionaba a pantalla completa y **no** en el atlas abierto desde Detalle GPS.
   ⚠️ **ORDEN SUYA (24-08):** cambiar sin dañar lo que ya está bien, y actuar solo sobre lo que él
   indica o lo que se DETECTA midiendo — **nunca sobre una suposición**.
3. **EL ATLAS TIENE SEIS CAPAS (`§ADR-079/080`): sol · temperatura · viento · lluvia · nubes · RAYOS.**
   ⏱️ **La frescura la manda la FUENTE, y son dos:** POWER/MERRA-2 (temp·viento·lluvia) va **4 días**
   atrás y POWER/CERES (sol·nubes) **87**; los rayos, **al minuto**. Por eso el vigía tiene dos
   relojes: 4 h para POWER y **1 h para rayos**. La fuente de cada capa se ve arriba, en la cinta.
   Los rayos son de OTRA fuente (GOES de NOAA) y **se ACUMULAN** en `herramientas/rayos-conteo.json`.
   ⚠️ **No son la DDT de RETIE/IEEE** — esa es la 2.ª capa y espera su cuenta Earthdata (`TODO-90`).
4. **LO QUE NO SE PUEDE ROMPER DEL CLIMA (`§ADR-057..079`):** gana el hecho sobre el modelo · el recorrido se comprueba **punto a punto**, nunca por promedio · el clima vive en el ATLAS y Detalle GPS = solo el recorrido · **«tormenta eléctrica» NO existe en la fuente de nubes**, y hay prueba.
5. **CERRADO 23/24-08 (detalle en `99`):** trazado sobre el atlas · `ClimaDelAnio` retirado · vigía
   **cada 4 h** + la pantalla dice **de cuándo es el dato** · los dos ajustes de GitHub · hora a hora
   también en el atlas de Detalle GPS · **sexta capa: RAYOS** (`§ADR-074..079`).
   ⚠️ El robot NO dispara el CI: **el vigía firma su propio check** tras correr la suite.
   **VIVO:** `TODO-87` (Radiación y Temperatura al atlas, ~400 líneas) · `TODO-89` y `TODO-90`, suyos.
   ⏳ **ESPERA SU RESPUESTA:** dice que el satelital tiene huecos; está al **100 % en z8-z16** →
   falta **DÓNDE los ve**.
6. **⚠️ EL LIENZO NO SE VE EN SEGUNDO PLANO, PERO SE FOTOGRAFÍA** (`34 · L-16/L-58/L-72`):
   `SONDA_MAPA=1 npm run build` + `npx vite preview` en `web/` + `foto-del-banco.mjs "<url>"
   --salida f.png [--pulsar ".maplibregl-ctrl-zoom-in" --veces 6]`. **Nunca con tiempo virtual.**
7. **FASE ABIERTA: la página.** No eligió entre ② **se lee** y ③ **no se cae**. ⚠️ `31 · L-60` puede estar MAL: verificar antes de citarlo.
8. **SON DE ÉL** (detalle abajo): `TODO-57` el dato de la ficha · **contraseña** · `TODO-71` viento
   y los 1.000 W/m² · `TODO-33` · `TODO-76` · `TODO-80/81/82/83/88/89/90`.
9. **Higiene** (`99 §ADR-047/048`). ⚠️ El techo es el **ARRANQUE**; `20` y `00` pasan su tope.

## 🚫 INVARIANTES — índice; cada uno vive ENTERO en su ADR

· **Carcasa** `§ADR-018` — `amanecer` inalcanzable si falta un apoyo; el veredicto sale de `utilizacion_pct`, nunca de `cargaRotura_kgf`; dueños únicos en `vistas/`.
· **Puntos nuevos** `§ADR-027/054` — identidad por NOMBRE, anotada ANTES; se biseca y el origen entra con `mínimo − 1`: nunca se renumera.
· **RCA** `§ADR-020/026` — prohibido rankear hipótesis, causa raíz por IA y % de confianza; las causas las lee `causasDeclaradas()`.
· **Acceso** `§ADR-024` — la contraseña es HIGIENE, la frontera son las reglas. · **Fotos** `§ADR-031` — el portero NO borra y NO lista; cuelga por nombre canónico.
· **Capas del mapa** `§ADR-034/037/046/079` — viajan CON el sitio; se guardan como MEDIDA (byte 0 = SIN DATO); el pronóstico no se guarda; toda capa trae encuadre Y escala, las dos o ninguna.
· **Ficha y lote** `§ADR-030/038` — el lote rellena huecos, y solo los 3 del MODELO. · **Recordar ≠ proponer** `§ADR-029` — sin decisión suya el campo queda VACÍO.
· **Verosimilitud** `§ADR-050` — la escala son TRES y se LEE del molde; una rival se cierra diciendo qué se hizo y cómo quedó, no con etiqueta.
· **Señales de la página** `§ADR-051` — banda, pestaña y tope de tiro salen del DATO, con un solo dueño; la versión del motor la ata un gate de `pre-commit`.
· **El número que se firma** `§ADR-052` — un tope declarado manda en TODAS las piezas, y el molde tiene que admitirlo o la base lo tira en silencio.
· **Atlas** `§ADR-045/053/055/056/079` — UN motor y UN escritor de fichas para los SEIS. El viento y los rayos NO marcan hipótesis; en el mapa de la línea van como dato del SITIO.
· **Documentación** `§ADR-021` — el verde de `brain:check` dice CONSTRUIDO, no verdad.

## 🧭 Cómo retomar

1. **Abrir Claude Code DENTRO del proyecto** (desde el paraguas: `session-handoff.mjs --boot-echo`).
2. Desplegar: `npm run build && npm run deploy --workspace web`, en ese orden (`32 · L-35`); reglas
   de Firestore por SU canal y ANTES (`31 · L-22`). Repo PÚBLICO → **cero bytes de cliente**.
3. **Verificar contra PRODUCCIÓN con su Chrome**, no contra `dist/` (`32 · L-18/35`). Para el MAPA,
   banco sin sesión Y **foto**: `herramientas/foto-del-banco.mjs` (`34 · L-72`).
4. Antes de CADA push: `npm test` + `contrato:verificar` + `brain:check`.

## 🔲 Pendientes del INGENIERO

| # | Qué | Por qué importa |
|---|---|---|
| **CLAVE** | **Ponerse contraseña.** La llave admin ya NO está en Descargas: regenerarla (Consola Firebase → Cuentas de servicio) y guardarla fuera. Después: `usuarios.mjs contrasena … --definitiva`, o la cuenta queda provisional | Desbloquea retirar Google (2b) |
| **TODO-57** | **La FICHA se puede ESCRIBIR y está EN PRODUCCIÓN** (`99 §ADR-030`). Falta **el DATO**: ¿está en planos y actas, o hay que levantarlo? Los seis: rotura · altura libre · altura del amarre · capacidad longitudinal · fases amarradas · tipo de apoyo | **EL CUELLO DE BOTELLA REAL.** Al meter el primero saldrán «REVISAR»: no son averías nuevas |
| **TODO-81** | **Descargar el acta de la carga del 22-08** desde Cargar: es el único sitio donde queda escrito POR QUÉ se decidió cada cosa | Se pierde al recargar |
| **TODO-82/83** | **Dos decisiones suyas sobre el clima.** ① ¿FASE 2 del pronóstico (`§ADR-057`): franja mañana/tarde y sensación térmica? ② ¿Dato FINO por extremos (`§ADR-064`)? Las capas de 2 km tocan **3 celdas** y salen por PROMEDIO | Sensación de **40 °C** con aire a 32,5 · amplitud fina: 1,2 °C |
| **TODO-88** | **¿Se junta otra vez el eje del tiempo?** Con `ClimaDelAnio` (`§ADR-074`) se fue el eje ÚNICO de `§ADR-058`: el atlas declara el régimen de cada día, pero **el pronóstico va aparte, en su tabla** — son DOS ejes. Es un resto de la migración | Medido y modelo en la misma tira hacía «ganar el hecho» de un vistazo |
| **TODO-80** | **¿Qué tope de puesta a tierra rige y cuál es la corriente de operación?** Los campos ya existen (`ADR-052`); declararlos basta. Sin decisión suya siguen **10 Ω** | Con 18 Ω medidos, 10 Ω dice «revisar» y 25 Ω «cumple» |
| **TODO-91 NUEVO** | **¿Sol y nubes de 87 días a 15 MINUTOS?** El satélite de los rayos publica radiación (`ABI-L2-DSRF`) y máscara de nubes (`ABI-L2-ACMF`) casi en vivo, gratis y sin llave (`§ADR-080`). No es un parche: OTRA capa —instantánea cada 10 min, no media; máscara, no % de cielo—, 11,7 MB/archivo | Es el salto más grande que le queda al atlas |
| **TODO-90** | **La capa de rayos que piden las NORMAS** (rayos/km²/año, RETIE e IEEE 1243), que él pidió junto con la horaria (`§ADR-079`). La climatología de NASA está detrás de una **cuenta Earthdata gratuita**: en cuanto exista, se baja y se publica con más detalle espacial que los atlas actuales | La horaria dice CUÁNDO hubo tormenta; ésta es la que entra en el cálculo de salidas por descarga |
| **TODO-89** ⬅️ **DOS ÓRDENES SUYAS** | **Encender el despliegue automático** (`§ADR-077`, ya preparado y con comprobación de que llegó). Falta la llave, y las llaves no pasan por el chat: `gh secret set CLOUDFLARE_API_TOKEN` (crear en Cloudflare → My Profile → API Tokens, permiso **Account · Cloudflare Pages · Edit**) y `gh secret set CLOUDFLARE_ACCOUNT_ID` = `ecc6a431…` (`npx wrangler whoami`). ⚠️ Al encenderlo, **nadie mirará el mapa antes de publicar** | Tercer y último eslabón de «que se actualice cada 4 horas» de verdad |
| **TODO-72** | **¿Autorización del IGAC para sus ortoimágenes?** Cubren esto a **3 m** y **10 cm** en Turbaco, contra los 10 m de Sentinel-2 (`99 §ADR-040`) | Única vía a más resolución real |
| **TODO-71** | **¿Se cierran las hipótesis con dato real?** El **viento** (`ADR-035`) y los **1.000 W/m² adoptados**. Los cuatro atlas (`ADR-055`) los ACERCAN y NO los cierran: un año de medias horarias no valida un extremo de diseño | De ahí salen los tiros y la capacidad |
| **TODO-59** | **Qué ficha se le pide a CADA tipología.** La línea mezcla 4 y el molde es de POSTE (`40 §8.3`) | Son 3 o 4 formularios |
| **TODO-33** | **50 % o 25 % de RTS** como tope de tiro. Ya no hay dos dueños (`§ADR-051`): falta decidir CUÁL rige | Factor 2 sobre un dictamen |
| **TODO-58** | **¿Dónde deben vivir los datos?** Hoy Firestore (São Paulo) y R2 bajo TUS cuentas, con datos del empleador | La región de Firestore es INMUTABLE |
| **TODO-44/34** | Alerta de gasto en Cloudflare · **respaldo FUERA de esta Mac**: la bóveda **no tiene remoto** | Un fallo de disco se la lleva |
| **TODO-61/54/68** | ¿App Check? · ¿linter de frescura semántica? · ¿cazar un ADR repetido? Las dos últimas tocan el KERNEL | Las TRES son TUYAS |
| **TODO-76** | **¿Se guarda que un apoyo es autosoportado / retenido?** Hoy no cabe en el modelo: iría por APOYO (26 declaraciones) | Cierra media incógnita de la capacidad longitudinal |
| **TODO-78/84** ⬆️⬆️ | **Cerebro LLENO** (`§ADR-065`): el ARRANQUE va al ras y cada sesión gasta un rato raspando texto bueno para que quepa el nuevo. **Shard o recalibrar** | Ya es el freno más caro del día a día|

## 🔲 Pendientes de CLAUDE — en este orden

| # | Qué | Dónde está el plan |
|---|---|---|
| **TODO-70** | **Cerrar la ola de la ficha.** Queda SOLO ③: el gesto «Confirmo este dato», que exige su propio molde | `99 §ADR-030/032/033/038` |
| **TODO-66** | **Que una acción pruebe que FUNCIONÓ**, no solo que se hizo: verificación posterior con fecha | `99 §ADR-026` |
| **TODO-50** | **Blindaje**: ✅ F1 · ✅ F2a · ✅ F3 · ⬜ **2b retirar Google** — espera la contraseña | `99 §ADR-019/024` |
| **TODO-79** | **Saldo del entorno: 34 vivos + 5 parciales**, por gravedad (`99 §ADR-049`). Los dos restos más caros: el identificador crudo en el **informe firmable** y la red del **mapa** | Varios son decisión suya |
| **TODO-52/49/48** | RCA: el lienzo del árbol · contador de PARQUE · deuda de ADR-017 | `99 §ADR-017/018/020` |
| **TODO-30/11 · 13-23** | XSD de GPX/KML en CI · nota técnica de LN-627 · F3-F5 | crudo de `ADR-013` |

## ✅ Consolidado — el detalle vive en su dueño

La línea → `40 §10`, `99 §ADR-013/017` · las 205 fotos → `99 §ADR-031` · IDEAM (sin rayos) →
`35 · L-37` · callejones → `30`, y el que más se repite: **«verde no prueba nada»** (`30 · L-33/56`).
