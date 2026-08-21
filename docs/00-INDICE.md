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
| `ADR-018` | 2026-08-04 | **Carcasa «El Horizonte»:** piel CLARA sobre esqueleto de 3 columnas. La luz no es gusto sino control: en pantalla oscura un dato que falta se esconde. Las 4 maquetas anteriores dejaban una línea «sana» con 0 apoyos dictaminados; aquí `amanecer` es inalcanzable si falta uno, con prueba. **NO revisada** | `research-archive/2026-08-04-workflow-critica-carcasa.json` |
| `ADR-019` | 2026-08-04 | **Cero registro público**: el alta de personas es un acto administrativo — `herramientas/usuarios.mjs` es la única vía. RBAC por *claims*; cuentas que se deshabilitan y nunca se borran; cada cambio de rol revoca los tokens. La defensa canónica exige plan de pago: se DETECTA en vez de prevenir. 🟡 **Parcial**: falta retirar Google y App Check. **NO revisada** | *(sin crudo)* |
| `ADR-045` | 2026-08-21 | **Atlas solar del Caribe**: NASA POWER horario de 2026 sobre siete departamentos, en pantalla propia (`#/sol`) con mapa base y vigía propios. IDEAM no publica radiación; NSRDB va por 2023. **11 de 36 celdas superan los 1.000 W/m² adoptados**, todas al norte. **Auditada con Fable: cazó un mes rancio que ningún guardián veía.** **NO revisada · verificado en vivo** | *(`tests/sol-caribe.test.js`)* |
| `ADR-044` | 2026-08-21 | **El cable de guarda entra como INVENTARIO de daño de operación**, vano a vano (contrato **0.7.0**). El hueco significa **NO CONSTA**, nunca «lo lleva». Se pinta sobre el mapa; se declara en Detalle GPS. No entra en ningún cálculo. **NO revisada · verificado en vivo** | *(`tests/cable-de-guarda.test.js`)* |
| `ADR-043` | 2026-08-21 | **La satelital SÍ se pintaba: lo roto era la SONDA** (global para DOS pantallas). Sonda por instancia + banco sin sesión. **verificado en vivo** | *(`tests/sonda-mapa.test.js`)* |
| `ADR-042` | 2026-08-20 | **El mapa como pantalla:** pestaña «Detalle GPS», controles AL LADO y botón «Ver todo el recorte» —el «no veo el gradiente» era el ENCUADRE, no la rampa—. **Revisada por Fable y encontró tres fallos reales** (`30 · L-62`). **Verificado en vivo** | *(`tests/detalle-gps.test.js`)* |
| `ADR-041` | 2026-08-20 | **Corrección de criterio:** la rampa de temperatura se ajusta al dato —una escala fija dejaba el mapa de un color y eso NO era prudencia (`30 · L-61`)— y la satelital sube al nivel 16 (2,4 m/píxel, 18,9 MiB). El aviso cambia de bando: el rojo no es calor extremo, son 3,2 °C más que el azul. **NO revisada · verificado en vivo** | *(`tests/temperatura.test.js`)* |
| `ADR-040` | 2026-08-20 | **La satelital se remuestrea en origen** (nivel 15 · 4,7 m/píxel) y mejora su realce; la pantalla dice lo que MIDE (10 m) **y** a lo que se publica. A más resolución no se va por **licencia**, no por técnica (`31 · L-60`, `TODO-72`). **NO revisada · verificado en vivo** | *(`tests/mapa-capas.test.js`)* |
| `ADR-039` | 2026-08-20 | **La temperatura del AIRE entra al mapa** (la del suelo no alimentaba ningún cálculo, `ADR-037`): misma fuente y licencia que el sol, 3 KiB. Es **MEDIA, no extremo**, y el mapa se ve liso porque cambia 1,2 °C de punta a punta. La EDS adoptada (28 °C) se sostiene: el sitio tiene 27,3. **NO revisada · verificado en vivo** | *(`tests/temperatura.test.js`)* |
| `ADR-038` | 2026-08-20 | **El lote de ficha ya tiene pantalla** (`TODO-70` ②): el dato de catálogo entra en los 25 apoyos de un gesto, y **no desbloquea ni un veredicto solo** (`33 · L-59`). **NO revisada · verificado en vivo** | *(`tests/ficha-lote.test.js`)* |
| `ADR-037` | 2026-08-19 | **La capa del suelo se cambia por el RECURSO SOLAR**, que sí es entrada del cálculo (la ampacidad usa 1.000 W/m² ADOPTADOS). Trece capas del **Global Solar Atlas** (CC BY 4.0), **3 KiB**. ⚠️ Se mapea ENERGÍA DIARIA y la norma come IRRADIANCIA INSTANTÁNEA: **no se convierte con una regla de tres**. **NO revisada** | *(`tests/radiacion.test.js`)* |
| `ADR-036` | 2026-08-19 | **Una capa de datos se guarda como MEDIDA, no como imagen pintada.** Con la rejilla de valores salen elegir la capa temporal, **leer el valor de un punto con un clic** e interpolación al acercarse — y pesa menos. **Byte 0 = SIN DATO**, nunca cero. (Su capa térmica la reemplazó `ADR-037`.) **NO revisada** | *(`tests/rejilla.test.js`)* |
| `ADR-035` | 2026-08-19 | **El pronóstico entra como capa, pero no como dato.** Fuente MET Norway (CC BY 4.0, sin clave); Open-Meteo fuera por no comercial. **NO SE GUARDA JAMÁS** —archivarlo lo convertiría en una falsa medición— y dice que **no valida la hipótesis**. **NO revisada** | *(`tests/pronostico.test.js`)* |
| `ADR-034` | 2026-08-19 | **Se enciende la satelital y entra la del calor del suelo.** Licencias verificadas: Esri, EOX y Open-Meteo **prohíben el uso comercial** gratis. Se PROCESA el dato abierto y se autohospeda: Sentinel-2 y Landsat. Recorte metropolitano: ceñirlo al corredor lo delataría. **NO revisada** | *(`tests/mapa-capas.test.js`)* |
| `ADR-033` | 2026-08-19 | **El sembrador respeta el cerrojo.** Metía `revision: 0` con `merge`, así que resembrar sobre un apoyo ya editado rompía su siguiente guardado con un conflicto inexistente. Se lee antes de escribir y no se pisan `revision`, `creadoEn` ni `creadoPor`. **NO revisada · sin correr contra la base** | *(`tests/sembrar-mapeo.test.js`)* |
| `ADR-032` | 2026-08-19 | **Un veredicto sobre un dato que nadie verificó lo dice en el papel** — informe, gerencial, CSV y pantalla (`TODO-70` ①). Quién decide qué está supuesto es **el MOTOR**, único que sabe qué campos comió cada eje. La marca que ya existía no disparaba nunca (`33 · L-53`). **NO revisada** | *(`tests/informe.test.js`)* |
| `ADR-031` | 2026-08-17 | **Las fotos se suben DESDE la aplicación.** El portero acepta **una** ruta de escritura (`PUT`) con el token de la sesión, bajo diez cerrojos; sigue sin borrar ni listar. **No estrena ni una credencial.** **NO revisada** | *(`tests/portero.test.js`)* |
| `ADR-030` | 2026-08-17 | **La ficha estructural se puede ESCRIBIR.** 0 veredictos no era fallo del cálculo: no había por dónde meter el dato (`TODO-57`). Seis campos, procedencia por CAMPO y el antes/después sobre el TRAMO ENTERO antes de guardar. Nada se prerrellena. **NO revisada externamente** | *(`tests/ficha-editable.test.js`)* |
| `ADR-029` | 2026-08-17 | **RECORDAR no es PROPONER.** La pantalla devuelve lo que él ya firmó, con la fecha pegada y nunca como sugerencia. El veto de `ADR-028` no se hereda jamás. **NO revisada externamente** | `research-archive/2026-08-17-workflow-recordar-no-proponer.json` |
| `ADR-028` | 2026-08-17 | **La carga de puntos se hace DESDE la aplicación**, con su sesión y su rol: la llave maestra deja de hacer falta para el trámite semanal. La identidad se acuña en el repositorio. Dos fallos FATALES con 1.206 pruebas en verde. **NO revisada externamente** | `research-archive/2026-08-17-workflow-importar-en-la-app.json` |
| `ADR-027` | 2026-08-16 | **La identidad de un punto nace de su NOMBRE CANÓNICO**, nunca del índice ni del nombre del GPS (que trae errores: E07 quedó grabado «E02»). Las 26 semillas de julio quedan ancladas en `herramientas/semillas-emitidas.json`, registro que solo crece. Un punto intercalado entra por **bisección** del `orden`: renumerar habría PISADO 64 fotos. Contrato **0.5.0**, desplegar antes y sembrar después. **NO revisada externamente** | `research-archive/2026-08-16-workflow-mapa-identidad-apoyos.json` |
| `ADR-026` | 2026-08-07 | **Varias causas raíz, cinco familias nuevas y la séptima condición.** Todo ADITIVO. `causasRaiz` es lista con el tipo de IEC 62740 —única · múltiple · **contribuyente**, que cambia la probabilidad pero puede no evitarlo—; `causasDeclaradas()` es el dueño único de la precedencia y el molde rechaza escribir los dos campos a la vez. Séptima condición: ninguna hipótesis rival viva y callada. **NO revisada externamente** | `research-archive/2026-08-06-workflow-rca-vs-iec62740.json` |
| `ADR-025` | 2026-08-06 | **RCA contrastado contra IEC 62740**: la fórmula firmable es «contrastado contra la norma», nunca «conforme». Se adoptan sus exigencias donde el módulo se quedaba corto y se declara lo que NO se adopta, con el porqué. **NO revisada externamente** | `research-archive/2026-08-06-workflow-rca-vs-iec62740.json` |
| `ADR-024` | 2026-08-06 | **La puerta de acceso**: orden fechada en el token + recibo en la base. La pantalla de contraseña es **HIGIENE, no la frontera** —la frontera son las reglas y el rol—; quien entra por Google pasa SIEMPRE; la marca se lee `=== true` estricto; ante duda se deja pasar; el recibo se escribe DESPUÉS del cambio y solo si salió bien. **NO revisada externamente** | *(`tests/acceso.test.js`)* |
| `ADR-023` | 2026-08-05 | **Informe GERENCIAL**: documento aparte, no el técnico resumido — contesta otras preguntas (¿puedo firmar hoy?, ¿qué mando el lunes?, ¿qué queda abierto?) y comparte con el técnico el DUEÑO de la lista de límites, para que los dos papeles de la misma línea no puedan decir cosas distintas. Prohibido: decir que la línea es segura, y ordenar riesgos sin declarar que ordenar es criterio de gerencia, no resultado de cálculo. **NO revisada externamente** | *(`tests/gerencial.test.js`)* |
| `ADR-022` | 2026-08-05 | **Herramienta INTERNA, sin cliente ni contrato.** El comité fundador asumió un montaje comercial que nadie verificó, y de ahí salieron «las 7 preguntas» que la pizarra llamó ocho días el cuello de botella de TODO. Lo cazó el Ingeniero leyéndolas. El bloqueo REAL —la ficha estructural— no estaba en ninguna lista. Lección: `30 · L-42` | el supuesto está en `research-archive/2026-07-28-comite-vision-arquitectura.md §J` |
| `ADR-021` | 2026-08-04 | **El cerebro puede mentir con todos los gates en verde.** Auditoría de 5 lentes: 18 huecos confirmados con `brain:check` verde antes y después —`05` fechado seis días atrás, el router afirmando un SQLite que no existe, una referencia `L-NN` mandando a la lección equivocada, el correo de un tercero en el repo público—. **El linter valida ESTRUCTURA, no VERDAD.** Toda cifra copiada se retira del nodo que no es su dueño. **NO revisada** | `research-archive/2026-08-04-auditoria-documentacion-sesion.json` |
| `ADR-020` | 2026-08-04 | Segmento RCA **fuera** de la línea: la causa raíz cara es la que se REPITE, y dentro de una sola línea ese patrón es invisible. 11 espinas propias en vez de las 6M; no existe «no aplica». Clima IDEAM con tres trampas cazadas y los rayos declarados como hueco. **NO revisada externamente** | `research-archive/2026-08-04-workflow-rca-lineas-at.json` |

> Toda decisión cara de revertir entra aquí con su ADR y su crudo enlazado. Si hubo comité o consejo
> externo y el crudo no está archivado, la tarea **no está cerrada** (`CLAUDE.md §G.4`).
