# 📝 10 — MEMORIA DE CORTO PLAZO (pizarra viva)

> Se **AUTO-CARGA**. Pizarra, no bitácora (§G.3). **RELEVO 2026-08-22 (tarde).** Este nodo ES el
> relevo: léelo entero. Si contradice a `docs/.handoff-auto.md` (foto real de git), manda ese.

## 🎯 Dónde estamos

**Cifras vivas en `05`.** 14 pestañas + RCA + tres informes. Olas cerradas: ADR-018 · 020-024 · 032 ·
034-042 · 043-045 · **046-056**. Todo EN PRODUCCIÓN y **verificado en vivo con su sesión**.

> 🧭 **SE VA POR FASES, orden suya (22-08).** El **módulo RCA sigue APARCADO** —lo cerrado ahí es
> `§ADR-049/050`—. La fase viva es **la página**.

## 🛑 LO PRIMERO AL RETOMAR

1. **EL CUELLO DE BOTELLA NO ES CÓDIGO: ES EL DATO** (`05`): 0 de 26 con veredicto; falta `TODO-57`.
2. **EL PATRÓN QUE LO DOMINA TODO:** *«arreglado donde se veía, vivo en la pieza hermana»*
   (`ADR-046/049/052`). Lo gobiernan **`34 · L-65`** (una corrección es deuda con toda la familia),
   **`32 · L-67`** (vigila la función, no a quien la llama) y **`30 · L-68`** (el guardián recorre la
   tubería; un fixture hecho a mano no cruza la frontera).
3. **CERRADO 22-08: el clima de la línea, `§ADR-057` + `§ADR-058`.** ① El cielo mentía: rama inalcanzable + símbolo elegido por la MADRUGADA (`32 · L-69/L-70`). ② Las dos casillas del clima eran una pregunta partida en dos mandos: ahora se elige **FECHA** (1-ene → +11 d) y cada día declara su régimen. **Gana el hecho sobre el modelo**; el hueco SE VE. ③ `§ADR-059/060`: los atlas dan el DÍA, el veredicto contra su tope y el MES (12 de 19 días de agosto pasaron de 32 °C); lluvia y cielo en palabras (OMM) y **quinto atlas de NUBES** (ene-may: `CLOUD_AMT` va con la latencia del sol). **«Tormenta eléctrica» NO existe en esta fuente**, y hay prueba. Vigía semanal, cuatro atlas.
3. **LA FASE ABIERTA: la página.** Cerradas `§ADR-051` (banda, pestaña, tope, motor), `§ADR-052` ① el
   número que se firma, `§ADR-053/055/056` (los CUATRO atlas y el clima del año en el mapa) y
   `§ADR-054` (el extremo de origen). **Quedan DOS candidatas del triaje** —él elige—:
   ② **se lee**: renglones de 200 caracteres, encabezados desalineados de sus cifras, rótulos del
   Horizonte a 6 px, y el mapa que en 13" echa los indicadores fuera. ③ **no se cae**: una foto que
   falle deja la galería en blanco; la cartografía promete caché eterna y las cabeceras dicen otra.
   ⚠️ `31 · L-60` (ortos del IGAC) **puede estar MAL**: verificar ANTES de citarlo.
4. **SON DE ÉL**: `TODO-57` el dato de la ficha · **contraseña** (bloquea retirar Google) ·
   `TODO-71` viento y los 1.000 W/m² —los atlas lo acercan pero NO lo cierran: 42 °C medidos (2 sobre
   el peor escenario) y viento hasta 54 km/h, lejos de los 100 adoptados— · `TODO-33` 50 % o 25 % ·
   `TODO-76` retenida · `TODO-82` la fase 2 del pronóstico · `TODO-78` el nodo `33` al 99,9 % (`30 · L-68`) · `TODO-80` qué tope de tierra
   rige · **`TODO-81` NUEVO**: descargar el acta de la carga del 22-08.
5. **Higiene** (`99 §ADR-047/048`). ⚠️ El techo es el **ARRANQUE**, y `20`, `30` y `33` van al 99 %.

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
· **Verosimilitud** `§ADR-050` — la escala son TRES y se LEE del molde; una rival se cierra
  diciendo qué se hizo y cómo quedó, no con etiqueta.
· **Señales de la página** `§ADR-051` — banda, pestaña y tope de tiro salen del DATO, con un solo
  dueño; la versión del motor la ata un gate de `pre-commit`.
· **El número que se firma** `§ADR-052` — un tope declarado manda en TODAS las piezas, y el molde
  tiene que admitirlo o la base lo tira en silencio.
· **Atlas** `§ADR-045/053/055/056` — UN motor para los CUATRO. El viento NO marca la hipótesis; en
  el mapa de la línea van como dato del SITIO, no como campo.
· **Documentación** `§ADR-021` — el verde de `brain:check` dice bien CONSTRUIDO, no verdad.

## 🧭 Cómo retomar

1. **Abrir Claude Code DENTRO del proyecto** — desde el paraguas el gate bloquea el commit
   (remedio: `node scripts/session-handoff.mjs --boot-echo`).
2. Producción **https://mantenimiento-lineas-at.pages.dev** · repo PÚBLICO → **cero bytes de
   cliente** (`33 · L-23`). Desplegar: `npm run build && npm run deploy --workspace web`, en ese
   orden (`32 · L-35`); reglas de Firestore por SU canal y ANTES (`31 · L-22`).
3. **Verificar contra PRODUCCIÓN con el Chrome del Ingeniero**, no contra `dist/` (`32 · L-18/35`).
   Para el MAPA hay banco sin sesión: `SONDA_MAPA=1 npm run build` (`34 · L-63`).
4. Antes de CADA push: `npm test` + `contrato:verificar` + `brain:check`. Autenticados: `gh`, `wrangler`, `firebase`.

## 🔲 Pendientes del INGENIERO

| # | Qué | Por qué importa |
|---|---|---|
| **CLAVE** | **Ponerse contraseña.** La llave admin ya NO está en Descargas: regenerarla (Consola Firebase → Cuentas de servicio) y guardarla fuera. Después: `usuarios.mjs contrasena … --definitiva`, o la cuenta queda provisional | Desbloquea retirar Google (2b) |
| **TODO-57** | **La FICHA ESTRUCTURAL — se puede ESCRIBIR y está EN PRODUCCIÓN** (`99 §ADR-030`). Falta **el DATO**: ¿lo tiene la empresa en planos o actas, o hay que levantarlo? Los seis: carga de rotura · altura libre · altura del amarre · capacidad longitudinal · fases amarradas · tipo de apoyo | **EL CUELLO DE BOTELLA REAL.** Al meter el primero saldrán «REVISAR»: no son averías nuevas |
| **TODO-81** | **Descargar el acta de la carga del 22-08** desde la pantalla Cargar. El molde no tiene dónde guardar POR QUÉ decidió cada cosa; el acta sí, y es el único sitio donde ese razonamiento queda escrito | Se pierde al recargar la pantalla |
| **TODO-82** | **¿Se hace la FASE 2 del pronóstico?** (`99 §ADR-057`): franja mañana/tarde, sensación térmica y la HORA a la que empieza la lluvia —ya se calcula y no se pinta— | El 24-08 la sensación llegaba a **40 °C** con el aire a 32,5: el riesgo de la cuadrilla es invisible |
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
| **TODO-78** | **Los nodos `33` y `20` en su techo** (99,9 %): la siguiente lección o el siguiente archivo obligan a podar o partir | Perder texto, o pagar contexto cada sesión |
| **TODO-69** | ✅ **CERRADO 22-08.** El pórtico de ORIGEN y el empalme `EMP E01-E02` están CARGADOS y verificados en la base: 30 puntos, 26 estructuras, 3.032,8 m | — |
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
