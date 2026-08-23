# 📝 10 — MEMORIA DE CORTO PLAZO (pizarra viva)

> Se **AUTO-CARGA**. Pizarra, no bitácora (§G.3). **RELEVO 2026-08-23.** Este nodo ES el relevo:
> léelo entero. Si contradice a `docs/.handoff-auto.md` (foto real de git), manda ese.

## 🎯 Dónde estamos

**Cifras en `05`.** 14 pestañas + RCA + tres informes. Olas cerradas: ADR-018 · 020-024 · 032 ·
034-042 · 043-045 · **046-056**. Todo EN PRODUCCIÓN y **verificado en vivo con su sesión**.

> 🧭 **SE VA POR FASES, orden suya (22-08).** El **módulo RCA sigue APARCADO** —lo cerrado ahí es
> `§ADR-049/050`—. La fase viva es **la página**.

## 🛑 LO PRIMERO AL RETOMAR
1. **EL CUELLO DE BOTELLA NO ES CÓDIGO: ES EL DATO** (`05`): 0 de 26 con veredicto; falta `TODO-57`.
2. **EL PATRÓN QUE LO DOMINA TODO:** *«arreglado donde se veía, vivo en la pieza hermana»* —
   `34 · L-65`, `32 · L-67`, `30 · L-68`, `30 · M-01`. El 22-08 se cerraron TRES de esa familia.
3. **LA OLA DEL CLIMA, CERRADA (`§ADR-057..074`, 18 ADRs).** El clima **VIVE EN EL ATLAS**; Detalle GPS = solo el recorrido. Cinco atlas con el DÍA hora a hora, su veredicto, el MES y las escalas en palabras (OMM) con procedencia. Lo que no se puede romper: **gana el hecho sobre el modelo** · el recorrido se comprueba **punto a punto**, nunca por promedio · **«tormenta eléctrica» NO existe en esta fuente**, y hay prueba.
4. **DEL CLIMA (23-08, `§ADR-074`): ✅ `TODO-85` el TRAZADO ya se dibuja** sobre el atlas —celdas a
   rayas SIN relleno, traza y rótulo— y **✅ `TODO-86`** retirado `ClimaDelAnio.tsx`. **VIVO:**
   `TODO-87` migrar «Radiación solar» y «Temperatura ambiente» (OTRO subsistema, ~400 líneas; el
   enfoque recomendado sigue siendo un `<CapasDelCorredor mapa={...} />`). ⏳ **ESPERA SU RESPUESTA:**
   dice que el satelital tiene huecos; el archivo está al **100 % en z8-z16** → falta **DÓNDE los ve**.
5. **⚠️ EL LÍMITE DEL LIENZO, Y SU SALIDA (`§ADR-071` → `§ADR-074`, `34 · L-16/L-58/L-72`):** las
   pestañas de inspección van en SEGUNDO PLANO y **MapLibre no dibuja ahí** (gris, sin un error; el
   DOM sí se lee). **YA SE PUEDE MIRAR:** `SONDA_MAPA=1 npm run build` + `npx vite preview` en `web/`
   + `node herramientas/foto-del-banco.mjs "<url>" --salida f.png [--pulsar ".maplibregl-ctrl-zoom-in"
   --veces 6]`. ⚠️ **Nunca con `--virtual-time-budget`: pinta el ráster y NO las capas vectoriales.**
6. **FASE ABIERTA: la página.** No eligió entre ② **se lee** y ③ **no se cae**. ⚠️ `31 · L-60` puede estar MAL: verificar antes de citarlo.
7. **SON DE ÉL** (detalle en la tabla de abajo, no aquí): `TODO-57` el dato de la ficha ·
   **contraseña** · `TODO-71` viento y los 1.000 W/m² —los atlas lo ACERCAN y no lo cierran— ·
   `TODO-33` · `TODO-76` · `TODO-80` · `TODO-81` · `TODO-82/83` · `TODO-88`.
8. **Higiene** (`99 §ADR-047/048`). ⚠️ El techo es el **ARRANQUE**; `20` y `00` ya pasan su tope.

## 🚫 INVARIANTES QUE NO SE PUEDEN ROMPER

Cada uno vive ENTERO en su ADR: esto es el índice, léelo antes de tocar su subsistema.

· **Carcasa** `§ADR-018` — `amanecer` inalcanzable si falta un apoyo; el veredicto sale de
  `utilizacion_pct`, nunca de `cargaRotura_kgf`; dueños únicos en `vistas/`.
· **Puntos nuevos** `§ADR-027/054` — identidad por NOMBRE, anotada en el repo ANTES; se biseca y el
  origen entra con `mínimo − 1`: nunca se renumera.
· **RCA** `§ADR-020/026` — prohibido rankear hipótesis, causa raíz por IA y % de confianza; quien
  lee las causas es `causasDeclaradas()`.
· **Acceso** `§ADR-024` — la contraseña es HIGIENE, la frontera son las reglas. · **Fotos** `§ADR-031` — el portero NO borra y NO lista; cuelga por nombre canónico.
· **Capas del mapa** `§ADR-034/037/046` — viajan CON el sitio; se guardan como MEDIDA (byte 0 = SIN
  DATO); el pronóstico no se guarda; toda capa trae encuadre Y escala, las dos o ninguna.
· **Ficha y lote** `§ADR-030/038` — el lote rellena huecos, y solo los 3 del MODELO. · **Recordar ≠ proponer** `§ADR-029` — sin decisión suya el campo queda VACÍO.
· **Verosimilitud** `§ADR-050` — la escala son TRES y se LEE del molde; una rival se cierra diciendo qué se hizo y cómo quedó, no con etiqueta.
· **Señales de la página** `§ADR-051` — banda, pestaña y tope de tiro salen del DATO, con un solo
  dueño; la versión del motor la ata un gate de `pre-commit`.
· **El número que se firma** `§ADR-052` — un tope declarado manda en TODAS las piezas, y el molde
  tiene que admitirlo o la base lo tira en silencio.
· **Atlas** `§ADR-045/053/055/056` — UN motor para los CUATRO. El viento NO marca la hipótesis; en
  el mapa de la línea van como dato del SITIO, no como campo.
· **Documentación** `§ADR-021` — el verde de `brain:check` dice CONSTRUIDO, no verdad.

## 🧭 Cómo retomar

1. **Abrir Claude Code DENTRO del proyecto** (desde el paraguas: `session-handoff.mjs --boot-echo`).
2. Producción **mantenimiento-lineas-at.pages.dev** · repo PÚBLICO → **cero bytes de
   cliente** (`33 · L-23`). Desplegar: `npm run build && npm run deploy --workspace web`, en ese
   orden (`32 · L-35`); reglas de Firestore por SU canal y ANTES (`31 · L-22`).
3. **Verificar contra PRODUCCIÓN con el Chrome del Ingeniero**, no contra `dist/` (`32 · L-18/35`).
   Para el MAPA hay banco sin sesión Y **foto**: `herramientas/foto-del-banco.mjs` (`34 · L-72`).
4. Antes de CADA push: `npm test` + `contrato:verificar` + `brain:check`. Autenticados: `gh`, `wrangler`, `firebase`.

## 🔲 Pendientes del INGENIERO

| # | Qué | Por qué importa |
|---|---|---|
| **CLAVE** | **Ponerse contraseña.** La llave admin ya NO está en Descargas: regenerarla (Consola Firebase → Cuentas de servicio) y guardarla fuera. Después: `usuarios.mjs contrasena … --definitiva`, o la cuenta queda provisional | Desbloquea retirar Google (2b) |
| **TODO-57** | **La FICHA ESTRUCTURAL — se puede ESCRIBIR y está EN PRODUCCIÓN** (`99 §ADR-030`). Falta **el DATO**: ¿lo tiene la empresa en planos o actas, o hay que levantarlo? Los seis: carga de rotura · altura libre · altura del amarre · capacidad longitudinal · fases amarradas · tipo de apoyo | **EL CUELLO DE BOTELLA REAL.** Al meter el primero saldrán «REVISAR»: no son averías nuevas |
| **TODO-81** | **Descargar el acta de la carga del 22-08** desde la pantalla Cargar. El molde no tiene dónde guardar POR QUÉ decidió cada cosa; el acta sí, y es el único sitio donde ese razonamiento queda escrito | Se pierde al recargar la pantalla |
| **TODO-82/83** | **Dos decisiones suyas sobre el clima.** ① ¿FASE 2 del pronóstico (`§ADR-057`): franja mañana/tarde y sensación térmica? ② ¿Dato FINO por extremos (`§ADR-064`)? Las capas de 2 km tocan **3 celdas** y salen por PROMEDIO. (③ y ⑤ ✅ hechas: `§ADR-069/070` y el TRAZADO `§ADR-074`.) ④ **`TODO-87`: al Atlas «Radiación solar» y «Temperatura ambiente»**: capas FINAS del corredor, OTRO subsistema (~400 líneas); lo único que sigue en Detalle GPS | Sensación de **40 °C** con aire a 32,5 · amplitud fina: 1,2 °C |
| **TODO-88 NUEVO** | **¿Se junta otra vez el eje del tiempo?** Al retirar `ClimaDelAnio` (`§ADR-074`) se fue con él el eje ÚNICO de `§ADR-058`: hoy el atlas declara el régimen de cada día en su cuadrícula, pero **el pronóstico va aparte, en su tabla** — son DOS ejes. Nadie lo pidió así: es un resto de la migración | Medido y modelo en la misma tira era lo que hacía «ganar el hecho» de un vistazo |
| **TODO-80** | **¿Qué tope de puesta a tierra rige, y cuál es la corriente de operación?** Desde `ADR-052` los dos campos existen en el molde: declararlos basta para que umbrales, ficha e informe usen el MISMO número. Sin decisión suya siguen **10 Ω** | Con 18 Ω medidos, 10 Ω dice «revisar» y 25 Ω dice «cumple» |
| **TODO-75** | **Dos ajustes de GitHub, o el vigía de los atlas no sirve** (`§ADR-045/053`). ① Actions → General → permitir que Actions **cree** propuestas. ② Proteger `main` exigiendo el CI | Sin los dos, no abre nada o abre algo sin revisar |
| **TODO-72** | **¿Autorización del IGAC para sus ortoimágenes** (o la tiene AFINIA por convenio)? Cubren esto a **3 m** en Bolívar y **10 cm** en Turbaco, contra los 10 m de Sentinel-2 (`99 §ADR-040`, `31 · L-60`) | Única vía a más resolución real en el mapa |
| **TODO-71** | **¿Se cierran las hipótesis con dato real?** El **viento** (`ADR-035`) y los **1.000 W/m² adoptados**. Los cuatro atlas (`ADR-055`) los ACERCAN y NO los cierran: un año de medias horarias no valida un extremo de diseño | De ahí salen los tiros y la capacidad |
| **TODO-59** | **Qué ficha se le pide a CADA tipología.** La línea mezcla 4 y el molde es de POSTE (`40 §8.3`) | Son 3 o 4 formularios |
| **TODO-33** | **50 % o 25 % de RTS** como tope de tiro. Ya no hay dos dueños (`§ADR-051`): falta decidir CUÁL rige | Factor 2 sobre un dictamen |
| **TODO-58** | **¿Dónde deben vivir los datos?** Hoy Firestore (São Paulo) y R2 bajo TUS cuentas, con datos del empleador | La región de Firestore es INMUTABLE |
| **TODO-44/34** | Alerta de gasto en Cloudflare · **respaldo FUERA de esta Mac**: `brain-private` **no tiene remoto** (ADR-059) | R2 factura · un fallo de disco se lleva la bóveda |
| **TODO-61/54/68** | ¿App Check? · ¿que el linter vigile la frescura semántica? · ¿que cace un ADR repetido? (`30 · L-47`). Las dos últimas tocan el KERNEL | Las TRES son TUYAS |
| **TODO-76** | **¿Se guarda que un apoyo es autosoportado / retenido?** Hoy no cabe en el modelo: iría por APOYO (26 declaraciones) | Cierra media incógnita de la capacidad longitudinal |
| **TODO-78/84** | **Cerebro LLENO, topes descuadrados** (`§ADR-065`): 5 nodos ≥90 % y **tres en leve exceso** (`20`, `00` y el `30` al ras). El `30` tiene 5.000 chars libres y 0 líneas; el `20` al revés. **Shard o recalibrar** | Cada edición obliga a raspar, y hoy ya obligó a fusionar dos filas del índice|
| **TODO-03/25/36** | Cronometrar LN-627 · probar descargas y Salir con su sesión | — |

## 🔲 Pendientes de CLAUDE — en este orden

| # | Qué | Dónde está el plan |
|---|---|---|
| **TODO-70** | **Cerrar la ola de la ficha (ADR-030).** Hechas ①②④ (`ADR-032/033/038`). **Queda SOLO ③: el gesto «Confirmo este dato»**, que exige su propio molde porque `FichaEstructural` rechaza `confirmado_humano` por diseño | `99 §ADR-030/032/033/038` |
| **TODO-66** | **Que una acción pruebe que FUNCIONÓ**, no solo que se hizo: bloque de verificación posterior y «pendiente de verificar eficacia» hasta esa fecha | `99 §ADR-026` |
| **TODO-50** | **Blindaje**: ✅ F1 · ✅ F2a · ✅ F3 · ⬜ **2b retirar Google** — espera la contraseña | `99 §ADR-019/024` |
| **TODO-79** | **Saldo del entorno: 34 vivos + 5 parciales** (`ADR-052` cerró 27 y 32), por gravedad (`99 §ADR-049` · crudo `2026-08-22-triaje-51-hallazgos-entorno.json`). Los dos restos más caros: el identificador crudo en el **informe firmable** (`exportar/informe.js:331`) y la red del **mapa**, que se traga el fallo y dice «no se pudo descargar» cuando falló dibujar | Varios son decisión suya |
| **TODO-52/49/48** | RCA: el lienzo del árbol · contador de PARQUE · deuda de ADR-017 | `99 §ADR-017/018/020` |
| **TODO-30/11 · 13-23** | XSD de GPX/KML en CI · nota técnica de LN-627 · F3-F5 | crudo de **ADR-013** |

## ✅ Consolidado — el detalle vive en su dueño, no aquí

La línea y sus hallazgos reales → `40 §10` y `99 §ADR-013/017` · las 205 fotos, cargadas y visibles
con tres defectos que no bloquean → `99 §ADR-031` · IDEAM (~11 días de desfase, rayos sin dato) →
`35 · L-37` · callejones probados → `30`, y el que más se repite es **«verde no prueba nada»**
(`L-33` · `32 · L-35` · `33 · L-53` · `30 · L-56`).
