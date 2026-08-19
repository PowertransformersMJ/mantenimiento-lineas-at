# 🗂️ 00 — ÍNDICE (capa de enrutamiento del cerebro)

> **No se auto-carga.** Es el mapa: ante una duda, NO escanees el cerebro entero — ven aquí, busca el
> síntoma y ve a la neurona que lo resuelve. Si una neurona existe y este índice no la conoce, el
> cerebro está roto (`CLAUDE.md §G.5`).

---

## Neuronas del proyecto

| Nodo | Qué guarda | Se carga |
|---|---|---|
| `CLAUDE.md` | Tronco encefálico: identidad, doctrinas y gobernanza | **siempre** |
| `docs/05-ESTADO-GLOBAL.md` | Signos vitales: en qué estado está el sistema AHORA | **siempre** |
| `docs/10-MEMORIA-CORTO-PLAZO.md` | Pizarra del trabajo vivo (WIP) y pendientes `TODO-NN` | **siempre** |
| `docs/20-MEMORIA-ESPACIAL.md` | Dónde vive cada cosa: mapa de carpetas, módulos y flujos | bajo trigger 🟡 |
| `docs/30-LECCIONES.md` | Memoria procedimental (madre): índice de TODOS los `L-NN` + las lecciones de método | bajo trigger 🧪 |
| `docs/31-LECCIONES-PROVEEDORES.md` | Hija de `30`: lo que depende de un tercero — su factura, su licencia o su SDK | bajo trigger 🧪 |
| `docs/32-LECCIONES-PANTALLA.md` | Hija de `30`: el cálculo salió bien y el usuario ve otra cosa | bajo trigger 🧪 |
| `docs/33-LECCIONES-NUCLEO-Y-DATO.md` | Hija de `30`: el número que se firma y el dato que no puede salir del repo | bajo trigger 🧪 |
| `docs/40-DOMINIO-LINEAS-AT.md` | Lóbulo de dominio: ingeniería de líneas AT, fórmulas y su procedencia | bajo trigger 🔵 |
| `docs/99-HISTORIAL-ADR.md` | Largo plazo: por qué se decidió cada cosa (`ADR-NNN`) | bajo trigger 🟢 |

**Fuera del repo:** `../brain-private/mantenimiento-lineas-at/` — bóveda privada, uso local.
Guarda `research-archive/` (crudos de deliberación: comités, consejos externos) y `fixtures/`
(datos reales de cliente que las pruebas usan pero que **no** se commitean).

---

## Síntoma → neurona

| Si te pasa esto… | Ve a… |
|---|---|
| «¿en qué estado está el proyecto?» | `05` |
| «¿qué estaba haciendo?, ¿qué quedó pendiente?» | `10` |
| «¿dónde vive este módulo / esta función / este flujo?» | `20` |
| «esto ya lo intenté y falló», «¿esta operación tiene truco?» | `30` (índice) y de ahí al hijo |
| «entra en local y falla en producción», «no me deja entrar / leer» | `31` |
| «desplegué y la pantalla sigue igual», «el mapa es un rectángulo gris» | `32` |
| «este número del informe firmable no cuadra» | `33` |
| «¿qué es el vano ideal de regulación?», «¿de dónde sale esta fórmula?» | `40` |
| «¿por qué se eligió este stack y no el otro?» | `99` |
| «¿por qué la prueba espera exactamente este número?» | `40 §8` y `tests/nucleo.test.js` |
| «voy a tomar una decisión cara de revertir» | `CLAUDE.md §G.2` 🛰️ + comité + consejo externo |
| «¿puedo commitear este archivo?» | `33 · L-07`, `L-23` y `.gitignore` |
| «¿esto cuesta dinero?» | `31 · L-02`, `L-04` y `99` |

---

## Mapa de código (resumen — detalle en `20`)

| Carpeta | Qué es |
|---|---|
| `nucleo/` | Cálculo de ingeniería: funciones **puras**, sin DOM ni red. El activo portado del módulo de campo. |
| `tests/` | Pruebas de oro del núcleo. Si algo aquí se pone rojo, es una regresión. |
| `scripts/` | **Kernel del cerebro** — no se edita aquí (se edita en `../brain-private/kernel/`). |
| `githooks/` | `pre-commit`: corre los gates del cerebro y bloquea el commit si algo está mal. |
| `docs/` | Las neuronas de este índice. |

---

## Historial de decisiones (`99`)

| ADR | Fecha | Decisión | Crudo de respaldo |
|---|---|---|---|
| `ADR-001` | 2026-07-29 | Arquitectura y stack de la plataforma | `research-archive/2026-07-28-comite-vision-arquitectura.md` |
| `ADR-002` | 2026-07-29 | Integración del Consejo Externo: confirma ADR-001 y lo enmienda en 3 puntos | `research-archive/2026-07-29-consejo-externo-respuesta.md` |
| `ADR-003` | 2026-07-29 | El Ingeniero fija alcance (plataforma completa e independiente) y presupuesto (asume el coste al pasarse) | — (decisión directa del dueño) |
| `ADR-004` | 2026-07-29 | Subsistema de IA (API de Anthropic) y contrato para trabajar frontend y backend en paralelo | `research-archive/2026-07-29-arquitectura-ia-y-paralelo.md` |
| `ADR-005` | 2026-07-29 | Framework del frontend: React 19 como aplicación de una sola página, sin meta-framework | `research-archive/2026-07-29-comite-framework-frontend.md` |
| `ADR-006` | 2026-07-30 | Exportadores GPX/KML/CSV: paridad de formato con el original, verdad del modelo corregido | `tests/exportar.test.js` (evidencia reproducible) |
| `ADR-007` | 2026-07-30 | Auditoría original-vs-web (7 auditores Opus) y Ola 1 premium ejecutada | `research-archive/2026-07-30-auditoria-original-vs-web-7-dimensiones.json` |
| `ADR-008` | 2026-07-31 | Décima colección `investigaciones`: el expediente de falla es un tipo propio | bóveda `fixtures/LN-627-falla.json` |
| `ADR-009` | 2026-07-31 | Inventario de brechas (79, 31 P0) y primera tanda de cierre: diagramas, umbrales, vano a vano, cantidades, coherencia | `research-archive/2026-07-31-brecha-original-vs-web-8-segmentos.json` |
| `ADR-010` | 2026-08-01 | Cómo se sirven las fotos: un portero (Worker) que verifica la firma del token delante del depósito privado | — (decisión de arquitectura, sin comité) |
| `ADR-011` | 2026-08-01 | La carga sobre la estructura: pestaña «Cargas» (la 11ª) y contrato v0.2.0 con las dos alturas del apoyo | `tests/cargas-vista.test.js` (evidencia reproducible) |
| `ADR-012` | 2026-08-01 | El eje longitudinal (terminal · desequilibrio · rotura), diseñado con workflow de 7 agentes y verificado a mano contra el motor | `research-archive/2026-08-01-workflow-eje-longitudinal.json` |
| `ADR-013` | 2026-08-03 | Auditoría adversarial de la ola 4: 9 fallos que 564 pruebas en verde no veían, incluido un portero que fallaba ABIERTO | `research-archive/2026-08-03-auditoria-ola-4.json` |
| `ADR-014` | 2026-08-03 | Los once menores cerrados: un dueño único para la deflexión y para el dialecto CSV, el tope de tiro con su procedencia verdadera, y las barreras imaginarias del portero corregidas | `research-archive/2026-08-03-auditoria-ola-4.json` |
| `ADR-015` | 2026-08-03 | Una foto puede colgar de un APOYO; y el número del archivo es el del PUNTO del levantamiento, no el de la estructura: `e07` es E06 | `research-archive/2026-08-03-auditoria-ola-4.json` |
| `ADR-016` | 2026-08-03 | El nodo de lecciones partido en madre-índice + 3 hijos por tema; los `L-NN` no se renumeran porque los cita el código fuente | `research-archive/2026-08-03-workflow-shard-nodo-30.json` |
| `ADR-017` | 2026-08-03 | La capacidad longitudinal entra al contrato (umbral 50/100 según el tipo) y el veredicto llega al producto: sin `nFasesAmarradas` era inalcanzable | `research-archive/2026-08-03-workflow-capacidad-longitudinal.json` |
| `ADR-018` | 2026-08-04 | Carcasa «El Horizonte»: piel CLARA sobre esqueleto de 3 columnas. La luz no es gusto sino control — en pantalla oscura un dato que falta se esconde; en clara se ve como un agujero. Las 4 maquetas anteriores dejaban una línea «sana» con 0 apoyos dictaminados y 2 lo afirmaban; aquí `amanecer` es inalcanzable si falta uno, con prueba. **NO revisada externamente** | `research-archive/2026-08-04-workflow-critica-carcasa.json` · `…-carcasa-horizonte.json` |
| `ADR-019` | 2026-08-04 | **Cero registro público**: el alta de personas es un acto administrativo, no un formulario — `herramientas/usuarios.mjs` es la única vía. RBAC por *claims* (admin/editor/cuadrilla/auditor) leído desde `firestore.rules`; cuentas que se deshabilitan y nunca se borran; cada cambio de rol revoca los tokens (sin eso el rol viejo vive una hora). La defensa canónica —*blocking function*— exige plan Blaze: se DETECTA con `auditar` en vez de prevenir, y consta como compromiso. 🟡 **Parcial**: falta retirar Google (espera contraseña), el cambio obligatorio y App Check. **NO revisada externamente** | *(sin crudo: no hubo comité; los hechos de proveedor van verificados con fuente dentro del ADR)* |
| `ADR-033` | 2026-08-19 | **El sembrador respeta el cerrojo.** Metía `revision: 0` con `merge`, así que resembrar sobre un apoyo ya editado le rompía el siguiente guardado con un conflicto inexistente — y una revisión hacia atrás deja de detectar el choque real (riesgo que `ADR-030` dejó vivo, `TODO-70` ④). Se lee antes de escribir y de lo que ya existe no se pisan `revision`, `creadoEn` ni `creadoPor`. La regla vive en el módulo PURO, que es lo único probable sin llave. **NO revisada · sin correr contra la base** | *(`tests/sembrar-mapeo.test.js`)* |
| `ADR-032` | 2026-08-19 | **Un veredicto sobre un dato que nadie verificó lo dice en el papel** — informe, gerencial, CSV y pantalla. Cierra la deuda de `ADR-030` (`TODO-70` ①). Quién decide qué está supuesto es **el MOTOR**, único que sabe qué campos comió cada eje; marcarlo desde el exporte da alarmas falsas. La marca que ya existía no disparaba nunca y su prueba la daba por buena (`33 · L-53`). **NO revisada · sin verificar en vivo** | *(`tests/informe.test.js` · `tests/longitudinal.test.js`)* |
| `ADR-031` | 2026-08-17 | **Las fotos se suben DESDE la aplicación.** El portero acepta **una** ruta de escritura (`PUT`) con el token de la sesión, bajo diez cerrojos; sigue sin borrar ni listar, con guardián. **No estrena ni una credencial.** **NO revisada · sin verificar en vivo** | *(`tests/portero.test.js`)* |
| `ADR-030` | 2026-08-17 | **La ficha estructural se puede ESCRIBIR.** 0 veredictos en los dos ejes no era fallo del cálculo: el motor dictamina desde hace meses y **no había por dónde meter el dato** (`TODO-57`). Entran SEIS campos, cada uno porque sin él no hay veredicto — leído en el motor. **La procedencia se declara por CAMPO y se captura por bloque**: preguntarla una vez mezclaría lo medido con lo leído de una placa, y el día de la firma no valen lo mismo. La regla dura vive en el molde: rechaza un valor sin sello, el selector arranca VACÍO y `confirmado_humano` no está — confirmar no es un origen, es un acto posterior. **El antes/después se enseña ANTES de guardar y sobre el TRAMO ENTERO**: los que ganan veredicto, **los que lo pierden** y los que pasan a REVISAR («no es una avería nueva, es lo que ya pasaba y no se veía»). Nada se prerrellena: resellaría con la fecha de hoy un dato de marzo. Deuda peligrosa (los papeles no marcaban los veredictos sobre datos SUPUESTOS) → **cerrada en `ADR-032`**. **NO revisada externamente** | *(`tests/ficha-editable.test.js`)* |
| `ADR-029` | 2026-08-17 | **RECORDAR no es PROPONER.** La pantalla le devuelve lo que él ya firmó, **con la fecha pegada** y nunca como sugerencia: libro que solo se APENDA, la app solo lo LEE (quien lo escriba puede fabricar un recuerdo) y **CARGADO manda sobre FIRMADO**. El veto de `ADR-028` no se reabre: cuál de sus puntos es y si lo aprueba **no se heredan jamás**. **NO revisada externamente** | `research-archive/2026-08-17-workflow-recordar-no-proponer.json` |
| `ADR-028` | 2026-08-17 | **La carga de puntos se hace DESDE la aplicación**, con su sesión y su rol: la llave maestra deja de hacer falta para el trámite semanal. **La identidad se acuña en el repositorio y el navegador solo la BUSCA.** Quinto workspace `importar/` + pestaña «Cargar», sin nada preseleccionado. Dos fallos FATALES con 1.206 pruebas en verde: la lectura previa que las reglas DENIEGAN, y la recarga que destruía el acuse. **NO revisada externamente** | `research-archive/2026-08-17-workflow-importar-en-la-app.json` · `…-construir-cargar.json` |
| `ADR-027` | 2026-08-16 | **La identidad de un punto nace de su NOMBRE CANÓNICO**, nunca del índice ni del nombre del GPS (que trae errores: E07 quedó grabado «E02»). Las 26 semillas de julio quedan ancladas en `herramientas/semillas-emitidas.json`, registro que solo crece. Un punto intercalado entra por **bisección** del `orden`: renumerar habría PISADO 64 fotos. Contrato **0.5.0**, desplegar antes y sembrar después. **NO revisada externamente** | `research-archive/2026-08-16-workflow-mapa-identidad-apoyos.json` |
| `ADR-026` | 2026-08-07 | **Varias causas raíz, cinco familias nuevas y la séptima condición.** Todo ADITIVO. `causasRaiz` es lista con el tipo de IEC 62740 —única · múltiple · **contribuyente**, que cambia la probabilidad pero puede no evitarlo—; `causasDeclaradas()` es el dueño único de la precedencia y el molde rechaza escribir los dos campos a la vez. Séptima condición: ninguna hipótesis rival viva y callada. **NO revisada externamente** | `research-archive/2026-08-06-workflow-rca-vs-iec62740.json` |
| `ADR-025` | 2026-08-06 | **RCA contrastado contra IEC 62740**: la fórmula firmable es «contrastado contra», NUNCA «conforme a» — y no por defecto nuestro: la IEC declara en su prólogo que **no atestigua conformidad**, y su cuerpo no tiene un solo requisito («should», nunca «shall»). Verificado sobre 13 de 151 páginas (preview oficial), declarado así. **NO se compra la norma**: sin cliente ni contrato (ADR-022), el valor de conformidad es cero. El hallazgo caro es INTERNO: el motor avisa de varias defensas y el molde solo deja declarar UNA causa raíz (→ `TODO-63`). Tres defectos cerrados: desplegable sin filtrar, informe reimplementando el juicio de las cadenas, y un comentario que prometía un control inexistente. Fable corrigió tres afirmaciones del informe. **NO revisada externamente** | `research-archive/2026-08-06-workflow-rca-vs-iec62740.json` |
| `ADR-024` | 2026-08-06 | **La puerta de acceso**: orden fechada en el token + recibo en la base, tres cerrojos para no encerrar a nadie, y el orden reautenticar→actualizar→recibo como invariante probado. El crítico destapó DOS agujeros ajenos al encargo: `/config` se leía sin organización —lo que hace falsa la frase «no pudo leer nada» del incidente del 31-07— y el botón Salir desaparecía en la pantalla de error. Filtrado por rol, rol en el portero y App Check DESCARTADOS por redundantes o por no ser revertibles con git. **NO revisada externamente** | `research-archive/2026-08-06-workflow-blindaje-acceso.json` |
| `ADR-023` | 2026-08-05 | **Informe GERENCIAL**: documento aparte, no el técnico resumido — sus 10 secciones se DERIVAN enteras de funciones ya probadas, aquí NO se calcula nada nuevo. Contesta si se puede firmar hoy, qué se manda el lunes, qué queda abierto aunque se haga todo y qué espera una firma del Ingeniero. El titular de la primera página es lo que NO se puede sostener, no lo que sí. Prohibido y probado: número o etiqueta de riesgo, precio, plazo, decir que la línea es segura, decir que ningún apoyo está sobrecargado, ordenar la cola sin declarar que el orden es criterio de gerencia, publicar un porcentaje de cobertura de inspección y texto escrito por un modelo. La lista de límites usa la MISMA función y el MISMO título que el técnico, con prueba de amarre — dos papeles de la misma línea no pueden decir cosas distintas. Un `lev` sin `puntos` lo tumbaba y 20 pruebas no lo veían: su fixture era más completo que la realidad (`30 · L-34`). **NO revisada externamente** | `research-archive/2026-08-01-workflow-eje-longitudinal.json` (clave `resultado.gerencial`) |
| `ADR-022` | 2026-08-05 | **Herramienta INTERNA, sin cliente ni contrato.** El comité fundador asumió un montaje comercial —cliente AFINIA, contrato, entregable aceptado, línea de proyecto— que nadie verificó nunca, y de ahí salieron «las 7 preguntas», que la pizarra llamó ocho días «el cuello de botella de TODO». Lo cazó el Ingeniero leyéndolas. `TODO-02` retirado por falta de objeto; el bloqueo REAL —la ficha estructural de los apoyos— no estaba en ninguna lista. Nacen `TODO-57` y `TODO-58`. Lección: `30 · L-42` | declaración del dueño; el supuesto está en `research-archive/2026-07-28-comite-vision-arquitectura.md §J` |
| `ADR-021` | 2026-08-04 | **El cerebro puede mentir con todos los gates en verde.** Auditoría de 5 lentes Opus disparada por «¿documentaste todo?»: 18 huecos confirmados con `brain:check` verde antes y después — `05` fechado seis días atrás y publicando el despliegue SIN `build`, el router afirmando SQLite local, la madre de lecciones sin las dos del día, una referencia `L-NN` mandando a la lección equivocada, y el correo de un tercero en el repo público. El linter valida ESTRUCTURA, no VERDAD. Toda cifra copiada se retira del nodo que no es su dueño. **NO revisada externamente** | `research-archive/2026-08-04-auditoria-documentacion-sesion.json` |
| `ADR-020` | 2026-08-04 | Segmento RCA fuera de la línea (la causa raíz cara es la que se REPITE, y dentro de una línea ese patrón es invisible). Las 6M descartadas: 11 espinas propias, «mano de obra» eliminada porque invita a culpar a una persona, «medición» como eje transversal. No existe «no aplica». Clima IDEAM desde el navegador con tres trampas cazadas (consulta que se colgaba, estaciones limnimétricas que no miden clima, lat/lon intercambiadas) y los rayos declarados como hueco. **NO revisada externamente** | `research-archive/2026-08-04-workflow-rca-lineas-at.json` |

> Toda decisión cara de revertir entra aquí con su ADR y su crudo enlazado. Si hubo comité o consejo
> externo y el crudo no está archivado, la tarea **no está cerrada** (`CLAUDE.md §G.4`).
