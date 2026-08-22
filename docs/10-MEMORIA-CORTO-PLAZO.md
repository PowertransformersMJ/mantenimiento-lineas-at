# 📝 10 — MEMORIA DE CORTO PLAZO (pizarra viva)

> Se **AUTO-CARGA**. Pizarra, no bitácora (§G.3). Tope ~110 líneas / 16k chars.
> **RELEVO 2026-08-22.** Este nodo ES el relevo: léelo entero. Si contradice a
> `docs/.handoff-auto.md` (foto real de git), manda ese.

## 🎯 Dónde estamos

**Cifras vivas en `05`.** 14 pestañas + RCA + tres informes. Olas cerradas: ADR-018 · 020-024 ·
**032** · **034-042** (capas del mapa) · **043-045** (satelital, cable de guarda, atlas solar) ·
**046-051** (21 y 22-08). Todo EN PRODUCCIÓN y verificado en vivo con su sesión.

> 🧭 **SE VA POR FASES, y es orden suya (22-08).** El **módulo RCA queda APARCADO** —lo cerrado ahí
> es `§ADR-049/050`; lo que falta NO se toca hasta que él lo diga—. La fase viva es **la página**.

## 🛑 LO PRIMERO AL RETOMAR

1. **EL CUELLO DE BOTELLA NO ES CÓDIGO: ES EL DATO.** La ficha se escribe, y por lote
   (`99 §ADR-030/038`). Siguen **0 de 25 con veredicto** y el lote no mueve ninguno solo: faltan las
   dos alturas (`33 · L-59`). Falta que él conteste `TODO-57`.
2. **EL PATRÓN QUE LO DOMINA TODO, y lo destapó él:** *«arreglado donde se veía, vivo en la pieza
   hermana»*. Salió en la capa de radiación (`ADR-046`) y se repitió al triar los 51 hallazgos del
   entorno (`ADR-049`): **de 7 dados por cerrados, 5 eran PARCIALES**. De ahí las dos lecciones que
   gobiernan lo que viene: **`34 · L-65`** —una corrección es deuda con toda la familia— y
   **`32 · L-67`** —un guardián que vigila la función y no a quien la llama cubre media carrera—.
3. **LA FASE ABIERTA: la página.** Cerrada la primera tanda (`§ADR-051`: la banda, el color de la
   pestaña, el tope de tiro y la versión del motor, todos derivados del dato). **Las tres candidatas
   para la siguiente, en orden de lo que rinde** —él elige—:
   ① **el número que se firma**: el tope de puesta a tierra tiene TRES versiones (el motor lee un
   campo que NO está en el molde, así que el informe dice siempre «adoptado por defecto») y el
   gerencial exige el despeje mínimo para siempre aunque esté declarado. ② **se lee**: renglones de
   200 caracteres, encabezados desalineados de sus cifras, rótulos del Horizonte a 6 px, y el mapa
   que en 13" echa los indicadores fuera. ③ **no se cae**: una foto que falle deja la galería en
   blanco; la cartografía promete caché eterna y las cabeceras dicen otra cosa.
   ⚠️ `31 · L-60` (licencia de las ortos del IGAC) **puede estar MAL**: verificar ANTES de citarlo.
4. **SON DE ÉL** (detalle en su tabla): `TODO-57` el dato de la ficha · **contraseña** (bloquea
   retirar Google) · `TODO-71` viento y los 1.000 W/m² · `TODO-33` si el tope es 50 % o 25 %, que
   ahora es UNA decisión y no tres sitios · `TODO-76` retenida · `TODO-78` el nodo `33` al 99,9 %.
5. **Higiene del cerebro** (`99 §ADR-047/048`): 28 huecos cerrados, familia de lecciones a 5 hijos,
   `00` vuelve a ser índice. ⚠️ El techo ya no es el tope del hijo: **es el ARRANQUE**, al límite.
6. **Las 205 fotos siguen cargadas y visibles** (`99 §ADR-031`); tres defectos no bloquean.

## 🚫 INVARIANTES QUE NO SE PUEDEN ROMPER

Cada uno vive ENTERO en su ADR: esto es el índice, léelo antes de tocar su subsistema.

· **Carcasa** `§ADR-018` — `amanecer` inalcanzable si falta un apoyo; el veredicto sale de
  `utilizacion_pct`, jamás de `cargaRotura_kgf`; dueños únicos en `vistas/`.
· **RCA** `§ADR-020/026` — prohibido rankear hipótesis, causa raíz por IA y % de confianza; quien lee
  las causas es `causasDeclaradas()`.
· **Acceso** `§ADR-024` — la contraseña es HIGIENE; la frontera son las reglas.
· **Fotos** `§ADR-031` — el portero NO borra y NO lista; se cuelga por nombre canónico.
· **Recordar ≠ proponer** `§ADR-029` — sin decisión suya el campo queda VACÍO.
· **Capas del mapa** `§ADR-034/037/046` — viajan CON el sitio; se guardan como MEDIDA (byte 0 = SIN
  DATO); el pronóstico no se guarda; y toda capa trae encuadre Y escala, las DOS o ninguna.
· **Ficha y lote** `§ADR-030/038` — el lote solo rellena huecos, y solo los tres campos del MODELO.
· **Verosimilitud** `§ADR-050` — la escala son TRES y se LEE del molde; una rival se cierra diciendo
  qué se hizo y cómo quedó, nunca con una etiqueta.
· **Señales de la página** `§ADR-051` — banda, color de pestaña y tope de tiro salen del DATO, con un
  solo dueño; la versión del motor la ata un gate de `pre-commit`.
· **Documentación** `§ADR-021` — el verde de `brain:check` dice bien CONSTRUIDO, no que diga verdad.

## 🧭 Cómo retomar

1. **Abrir Claude Code DENTRO del proyecto** — desde el paraguas el gate bloquea el commit
   (remedio: `node scripts/session-handoff.mjs --boot-echo`).
2. Producción **https://mantenimiento-lineas-at.pages.dev** · repo PÚBLICO → **cero bytes de cliente**
   (`33 · L-23`). Desplegar: `npm run build && npm run deploy --workspace web`, en ese orden
   (`32 · L-35`); reglas de Firestore por SU canal y ANTES (`31 · L-22`).
3. **Verificar contra PRODUCCIÓN con el Chrome del Ingeniero**, nunca contra `dist/` (`32 · L-18/35`).
   Para el MAPA hay banco sin sesión: `SONDA_MAPA=1 npm run build` (`34 · L-63`).
4. Antes de CADA push: `npm test` + `contrato:verificar` + `brain:check`. Autenticados: `gh`, `wrangler`, `firebase`.

## 🔲 Pendientes del INGENIERO

| # | Qué | Por qué importa |
|---|---|---|
| **NUEVO** | **Ponerse contraseña.** La llave admin ya NO está en Descargas: regenerarla (Consola Firebase → Cuentas de servicio → Generar nueva clave) y guardarla fuera de Descargas. Después: `usuarios.mjs contrasena … --definitiva` (sin eso la cuenta queda provisional y se revocan sus sesiones) | Desbloquea retirar Google (fase 2b) |
| **TODO-57** | **La FICHA ESTRUCTURAL — ya se puede ESCRIBIR, y está EN PRODUCCIÓN** (`99 §ADR-030`). Deja de estar bloqueada por el código: falta **el DATO**. ¿Lo tiene la empresa en planos o actas, o hay que levantarlo? Los seis: carga de rotura · altura libre · altura del amarre · capacidad longitudinal (con **qué ES** ese número) · fases amarradas · tipo de apoyo | **EL CUELLO DE BOTELLA REAL.** Al meter el primero saldrán «REVISAR»: no son averías nuevas, es lo que ya pasaba y no se veía |
| **TODO-75** | **Dos ajustes de GitHub, o el vigía del atlas solar no sirve** (`99 §ADR-045`). Verificado con `gh`: su token es de SOLO LECTURA y `main` no está protegida. ① Actions → General → permitir que Actions **cree** propuestas. ② Proteger `main` exigiendo el CI: un PR del robot NO dispara `ci.yml` y llegaría sin un solo check | Sin los dos, el vigía no abre nada o abre algo sin revisar. Primer disparo: 3-ene |
| **TODO-69** | **Verificar el pórtico de ORIGEN** de la línea (`99 §ADR-027/028/031`) | El único punto de esa carga que nadie ha mirado |
| **TODO-72** | **¿Autorización del IGAC para sus ortoimágenes** (o la tiene AFINIA por convenio)? Cubren esto a **3 m** en Bolívar y **10 cm** en Turbaco, contra los 10 m de Sentinel-2. La licencia publicada las veta para un sitio que las republique (`99 §ADR-040`, `31 · L-60`); el generador ya sabe pedirlas | Única vía a más resolución real en el mapa |
| **TODO-71** | **¿Se cierran las hipótesis con dato real?** Ninguna se cierra con un mapa: el **viento** (`ADR-035`) y los **1.000 W/m² adoptados** de la ampacidad, que el recurso solar rodea (`ADR-037`) sin sustituirlos —energía diaria ≠ irradiancia instantánea— | De ahí salen los tiros y la capacidad |
| **TODO-59** | **Qué ficha se le pide a CADA tipología.** La línea mezcla 4 (pórticos de 2 y 3 postes, torre reticulada, poste simple) y el molde es de POSTE (`40 §8.3`) | Son tres o cuatro formularios, no uno |
| **TODO-33** | **50 % o 25 % de RTS** como tope de tiro. Ya no hay dos dueños del número (`§ADR-051`): falta decidir CUÁL rige | Factor 2 sobre un dictamen |
| **TODO-58** | **¿Dónde deben vivir los datos?** Hoy Firestore (São Paulo) y R2 bajo TUS cuentas personales, con coordenadas y fotos del empleador | La región de Firestore es INMUTABLE |
| **TODO-44/34** | Alerta de presupuesto en Cloudflare · **respaldo FUERA de esta Mac**: las 205 fotos (127 MB) **ya están versionadas** en la bóveda desde el 21-08, pero `brain-private` **no tiene remoto** (decisión de ecosistema, ADR-059) | R2 factura · un fallo de disco se lleva la bóveda entera, no solo las fotos |
| **TODO-61/54/68** | ¿App Check? (se enciende en consola, `git revert` no lo deshace) · ¿que el linter vigile la frescura semántica? · ¿que cace un ADR repetido? — el `ADR-023` estuvo duplicado 9 días con todo en verde (`30 · L-47`). Las dos últimas tocan el KERNEL | Las TRES son TUYAS |
| **TODO-76** | **¿Se guarda que un apoyo es autosoportado / retenido?** Usted declaró que NINGUNO de LN-627 lleva retenida (`40 §Dato de campo`). Hoy **no cabe en el modelo**: iría por APOYO (25 declaraciones), nunca por línea. ¿Campo `tieneRetenida` sí/no, o «configuración» más ancha? | Cierra media incógnita de la capacidad longitudinal; la otra media —la sección— sigue abierta |
| **TODO-78** | **El nodo `33` queda al 99,9 %**: la siguiente lección de ese tema obliga a elegir entre podar o partirlo — y partirlo cuesta arranque para siempre (`99 §ADR-048`) | Perder texto, o pagar contexto cada sesión |
| **TODO-03/25/36** | Cronometrar LN-627 · probar descargas y Salir con su sesión | — |

## 🔲 Pendientes de CLAUDE — en este orden

| # | Qué | Dónde está el plan |
|---|---|---|
| **TODO-70** | **Cerrar la ola de la ficha (ADR-030).** ✅ ① 19-08 (`ADR-032`) marca del dato SUPUESTO · ✅ ④ 19-08 (`ADR-033`) el sembrador respeta el cerrojo —falta correrlo contra la base, espera la llave— · ✅ ② **HECHO 20-08** (`ADR-038`): la pantalla del LOTE, verificada en vivo. **Queda SOLO ③: el gesto «Confirmo este dato»**, que exige su propio molde porque `FichaEstructural` rechaza `confirmado_humano` por diseño — confirmar no es un origen, es un acto posterior | `99 §ADR-030/032/033/038` |
| **TODO-66** | **Que una acción pruebe que FUNCIONÓ**, no solo que se hizo (deuda declarada en `99 §ADR-026`): bloque de verificación posterior —cuándo, quién, si fue eficaz y cómo se comprobó— y la cerrada queda «pendiente de verificar eficacia» hasta esa fecha | `99 §ADR-026` |
| **TODO-50** | **Blindaje**: ✅ F1 · ✅ F2a · ✅ F3 pantalla de cambio · ⬜ **2b retirar Google** — espera la contraseña | `99 §ADR-019/024` |
| **TODO-52/49/48** | RCA: el lienzo del árbol (cosmético) · contador de PARQUE (no construible hoy) · deuda de ADR-017: al veredicto longitudinal le falta el ruido de tendido y el piso de validez | `99 §ADR-017/018/020` |
| **TODO-79** | **Saldo del entorno: 36 vivos + 5 parciales**, triados contra el código de hoy y ordenados por gravedad (`99 §ADR-049` · crudo `2026-08-22-triaje-51-hallazgos-entorno.json`). Los dos restos más caros: el identificador crudo en el **informe firmable** (`exportar/informe.js:331`) y la red del **mapa**, que se traga el fallo y dice «no se pudo descargar» cuando falló dibujar | Varios son decisión suya; otros tocan el molde |
| **TODO-30/11 · 13-23** | XSD real de GPX/KML en CI · nota técnica de LN-627 · F3-F5 (sincronización, Firestore vs D1, flujo IA, secretos) | crudo de **ADR-013** |

## ✅ Consolidado — el detalle vive en su dueño, no aquí

La línea y sus hallazgos reales → `40 §10` y `99 §ADR-013/017` · IDEAM (~11 días de desfase, rayos
sin dato) → `35 · L-37` · callejones probados → `30`, y el que más se repite es **«verde no prueba
nada»** (`L-33` · `32 · L-35` · `33 · L-53` · `30 · L-56`).
