# 📝 10 — MEMORIA DE CORTO PLAZO (pizarra viva)

> Se **AUTO-CARGA**. Pizarra, no bitácora (§G.3). **RELEVO 2026-08-22.** Este nodo ES el relevo:
> léelo entero. Si contradice a `docs/.handoff-auto.md` (foto real de git), manda ese.

## 🎯 Dónde estamos

**Cifras vivas en `05`.** 14 pestañas + RCA + tres informes. Olas cerradas: ADR-018 · 020-024 ·
**032** · **034-042** (capas del mapa) · **043-045** (satelital, cable de guarda, atlas solar) ·
**046-053** (21 y 22-08). Todo EN PRODUCCIÓN y verificado en vivo con su sesión.

> 🧭 **SE VA POR FASES, orden suya (22-08).** El **módulo RCA queda APARCADO** —lo cerrado ahí es
> `§ADR-049/050`; lo que falta NO se toca hasta que él lo diga—. La fase viva es **la página**.

## 🛑 LO PRIMERO AL RETOMAR

1. **EL CUELLO DE BOTELLA NO ES CÓDIGO: ES EL DATO** (`05`): 0 de 25 con veredicto; falta `TODO-57`.
2. **EL PATRÓN QUE LO DOMINA TODO, y lo destapó él:** *«arreglado donde se veía, vivo en la pieza
   hermana»*. Salió en la capa de radiación (`ADR-046`), se repitió al triar los 51 hallazgos
   (`ADR-049`: de 7 dados por cerrados, 5 eran PARCIALES) y otra vez en `ADR-052`, donde el tope de
   tierra arrastró tres piezas hermanas más. Lo gobiernan **`34 · L-65`** (una corrección es deuda
   con toda la familia), **`32 · L-67`** (vigila la función, no a quien la llama) y **`30 · L-68`**
   (el guardián recorre la tubería; un fixture hecho a mano no cruza la frontera).
3. **LA FASE ABIERTA: la página.** Cerradas `§ADR-051` (banda, pestaña, tope, motor), `§ADR-052`
   ① el número que se firma y `§ADR-053` (atlas de TEMPERATURA, y los dos en Detalle GPS).
   **Quedan DOS candidatas** —él elige—: ② **se lee**: renglones de 200 caracteres, encabezados
   desalineados de sus cifras, rótulos del Horizonte a 6 px, y el mapa que en 13" echa los
   indicadores fuera. ③ **no se cae**: una foto que falle deja la galería en blanco; la cartografía
   promete caché eterna y las cabeceras dicen otra. ⚠️ `31 · L-60` (ortos del IGAC) **puede estar
   MAL**: verificar ANTES.
4. **SON DE ÉL** (detalle en su tabla): `TODO-57` el dato de la ficha · **contraseña** (bloquea
   retirar Google) · `TODO-71` viento y los 1.000 W/m² —los atlas lo acercan pero NO lo cierran:
   42 °C medidos (2 sobre el peor escenario) y viento hasta 54 km/h, lejos de los 100 adoptados—
   · `TODO-33` 50 % o 25 % · `TODO-76` retenida · `TODO-78` el nodo `33` al 99,9 % (`30 · L-68`)
   · **`TODO-80`**: qué tope de tierra rige.
5. **Higiene** (`99 §ADR-047/048`). ⚠️ El techo es el **ARRANQUE**, y `20`, `30` y `33` van al 99 %.

## 🚫 INVARIANTES QUE NO SE PUEDEN ROMPER

Cada uno vive ENTERO en su ADR: esto es el índice, léelo antes de tocar ese subsistema.

· **Carcasa** `§ADR-018` — `amanecer` inalcanzable si falta un apoyo; el veredicto sale de
  `utilizacion_pct`, nunca de `cargaRotura_kgf`; dueños únicos en `vistas/`.
· **Puntos nuevos** `§ADR-027/054` — identidad por NOMBRE, anotada en el repo ANTES; se biseca y el origen entra con `mínimo − 1`: nunca se renumera.
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
· **Documentación** `§ADR-021` — el verde de `brain:check` dice bien CONSTRUIDO, no verdad.
· **El número que se firma** `§ADR-052` — un tope declarado manda en TODAS las piezas, y el molde
  tiene que admitirlo o la base lo tira en silencio.
· **Atlas** `§ADR-045/053/055` — UN motor y UNA pantalla para los CUATRO (sol · temperatura · viento
  · lluvia). El viento NO marca la hipótesis: un año de medias no valida un extremo de diseño.

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
| **CLAVE** | **Ponerse contraseña.** La llave admin ya NO está en Descargas: regenerarla (Consola Firebase → Cuentas de servicio) y guardarla fuera de Descargas. Después: `usuarios.mjs contrasena … --definitiva`, o la cuenta queda provisional y se revocan sus sesiones | Desbloquea retirar Google (2b) |
| **TODO-57** | **La FICHA ESTRUCTURAL — ya se puede ESCRIBIR, y está EN PRODUCCIÓN** (`99 §ADR-030`). Deja de estar bloqueada por el código: falta **el DATO**. ¿Lo tiene la empresa en planos o actas, o hay que levantarlo? Los seis: carga de rotura · altura libre · altura del amarre · capacidad longitudinal (con **qué ES** ese número) · fases amarradas · tipo de apoyo | **EL CUELLO DE BOTELLA REAL.** Al meter el primero saldrán «REVISAR»: no son averías nuevas, es lo que ya pasaba y no se veía |
| **TODO-75** | **Dos ajustes de GitHub, o el vigía de los atlas no sirve** (`§ADR-045/053`). Verificado con `gh`: su token es de SOLO LECTURA y `main` no está protegida. ① Actions → General → permitir que Actions **cree** propuestas. ② Proteger `main` exigiendo el CI: un PR del robot no dispara `ci.yml` | Sin los dos, no abre nada o abre algo sin revisar |
| **TODO-69** | ✅ Verificado 21-08: el pórtico de ORIGEN **no estaba donde se creía** —a 4,6 km del punto del 11-AGO—. Manda el nuevo, a 9,1 m de E01 (`§ADR-054`). **Falta que pulse «aprobar»** en Cargar: camino, libros e identidades ya están | Desaparecen los 4.604 m sin levantar: la línea queda COMPLETA |
| **TODO-72** | **¿Autorización del IGAC para sus ortoimágenes** (o la tiene AFINIA por convenio)? Cubren esto a **3 m** en Bolívar y **10 cm** en Turbaco, contra los 10 m de Sentinel-2. La licencia publicada las veta para un sitio que las republique (`99 §ADR-040`, `31 · L-60`) | Única vía a más resolución real en el mapa |
| **TODO-71** | **¿Se cierran las hipótesis con dato real?** Ninguna se cierra con un mapa: el **viento** (`ADR-035`) y los **1.000 W/m² adoptados** de la ampacidad, que el recurso solar rodea (`ADR-037`) sin sustituirlos —energía diaria ≠ irradiancia instantánea— | De ahí salen los tiros y la capacidad |
| **TODO-59** | **Qué ficha se le pide a CADA tipología.** La línea mezcla 4 (pórticos de 2 y 3 postes, torre reticulada, poste simple) y el molde es de POSTE (`40 §8.3`) | Son 3 o 4 formularios |
| **TODO-33** | **50 % o 25 % de RTS** como tope de tiro. Ya no hay dos dueños del número (`§ADR-051`): falta decidir CUÁL rige | Factor 2 sobre un dictamen |
| **TODO-58** | **¿Dónde deben vivir los datos?** Hoy Firestore (São Paulo) y R2 bajo TUS cuentas, con datos del empleador | La región de Firestore es INMUTABLE |
| **TODO-44/34** | Alerta de gasto en Cloudflare · **respaldo FUERA de esta Mac**: las 205 fotos ya están versionadas en la bóveda, pero `brain-private` **no tiene remoto** (ADR-059) | R2 factura · un fallo de disco se lleva la bóveda entera |
| **TODO-61/54/68** | ¿App Check? (se enciende en consola, `git revert` no lo deshace) · ¿que el linter vigile la frescura semántica? · ¿que cace un ADR repetido? (`30 · L-47`). Las dos últimas tocan el KERNEL | Las TRES son TUYAS |
| **TODO-76** | **¿Se guarda que un apoyo es autosoportado / retenido?** Usted declaró que NINGUNO de LN-627 lleva retenida (`40 §Dato de campo`). Hoy **no cabe en el modelo**: iría por APOYO (25 declaraciones), nunca por línea. ¿Campo `tieneRetenida` sí/no, o «configuración» más ancha? | Cierra media incógnita de la capacidad longitudinal; la otra media —la sección— sigue abierta |
| **TODO-78** | **El nodo `33` queda al 99,9 %**: la siguiente lección de ese tema obliga a elegir entre podar o partirlo — y partirlo cuesta arranque para siempre (`99 §ADR-048`) | Perder texto, o pagar contexto cada sesión |
| **TODO-80** | **¿Qué tope de puesta a tierra rige, y cuál es la corriente de operación?** Desde `ADR-052` los dos campos existen en el molde: declararlos en la hipótesis basta para que umbrales, ficha e informe usen el MISMO número. Sin decisión suya siguen **10 Ω**, dichos como lo que son: criterio de diseño, no norma citada — y el artículo del RETIE **sin verificar aquí** (`30 · L-09`) | Con 18 Ω medidos, 10 Ω dice «revisar» y 25 Ω dice «cumple»: es el veredicto del apoyo |
| **TODO-03/25/36** | Cronometrar LN-627 · probar descargas y Salir con su sesión | — |

## 🔲 Pendientes de CLAUDE — en este orden

| # | Qué | Dónde está el plan |
|---|---|---|
| **TODO-70** | **Cerrar la ola de la ficha (ADR-030).** Hechas ①②④ (`ADR-032/033/038`, la del lote verificada en vivo; el sembrador espera la llave). **Queda SOLO ③: el gesto «Confirmo este dato»**, que exige su propio molde porque `FichaEstructural` rechaza `confirmado_humano` por diseño — confirmar no es un origen, es un acto posterior | `99 §ADR-030/032/033/038` |
| **TODO-66** | **Que una acción pruebe que FUNCIONÓ**, no solo que se hizo (deuda declarada en `99 §ADR-026`): bloque de verificación posterior —cuándo, quién, si fue eficaz y cómo se comprobó— y la cerrada queda «pendiente de verificar eficacia» hasta esa fecha | `99 §ADR-026` |
| **TODO-50** | **Blindaje**: ✅ F1 · ✅ F2a · ✅ F3 pantalla de cambio · ⬜ **2b retirar Google** — espera la contraseña | `99 §ADR-019/024` |
| **TODO-52/49/48** | RCA: el lienzo del árbol (cosmético) · contador de PARQUE (no construible hoy) · deuda de ADR-017: al veredicto longitudinal le falta el ruido de tendido y el piso de validez | `99 §ADR-017/018/020` |
| **TODO-79** | **Saldo del entorno: 34 vivos + 5 parciales** (`ADR-052` cerró el 27 y el 32), triados por gravedad (`99 §ADR-049` · crudo `2026-08-22-triaje-51-hallazgos-entorno.json`). Los dos restos más caros: el identificador crudo en el **informe firmable** (`exportar/informe.js:331`) y la red del **mapa**, que se traga el fallo y dice «no se pudo descargar» cuando falló dibujar | Varios son decisión suya; otros tocan el molde |
| **TODO-30/11 · 13-23** | XSD de GPX/KML en CI · nota técnica de LN-627 · F3-F5 | crudo de **ADR-013** |

## ✅ Consolidado — el detalle vive en su dueño, no aquí

La línea y sus hallazgos reales → `40 §10` y `99 §ADR-013/017` · las 205 fotos, cargadas y visibles
con tres defectos que no bloquean → `99 §ADR-031` · IDEAM (~11 días de desfase, rayos sin dato) →
`35 · L-37` · callejones probados → `30`, y el que más se repite es **«verde no prueba nada»**
(`L-33` · `32 · L-35` · `33 · L-53` · `30 · L-56`).
