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
| `docs/31-LECCIONES-PROVEEDORES.md` | Hija de `30`: ANTES de contratar — licencia y coste de un tercero | bajo trigger 🧪 |
| `docs/35-LECCIONES-ACCESO-Y-PORTALES.md` | Hija de `30`: DESPUÉS — el tercero no deja entrar, o contesta 200 y miente | bajo trigger 🧪 |
| `docs/32-LECCIONES-PANTALLA.md` | Hija de `30`: el cálculo salió bien y el usuario ve otra cosa | bajo trigger 🧪 |
| `docs/33-LECCIONES-NUCLEO-Y-DATO.md` | Hija de `30`: el número que se firma y el dato que no puede salir del repo | bajo trigger 🧪 |
| `docs/34-LECCIONES-MAPA.md` | Hija de `30`: el mapa no pinta, o pinta algo que no se puede leer | bajo trigger 🧪 |
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
| «¿esto cuesta dinero?», «¿puedo usar esta capa en un trabajo que se factura?» | `31` |
| «entra en local y falla en producción», «no me deja entrar / leer», «el portal contesta y miente» | `35` |
| «desplegué y la pantalla sigue igual», «ese número está mal escrito» | `32` |
| «el mapa es un rectángulo gris», «enciendo la capa y no pasa nada», «no veo el gradiente» | `34` |
| «este número del informe firmable no cuadra» | `33` |
| «el CI está VERDE pero el cambio NO está en producción», «Actions en verde y la pantalla igual» | `32 · L-35/L-18` |
| «voy a añadir una capa o un atlas nuevo: ¿qué toco y qué NO?» | `20` + `99 §ADR-055/060` |
| «¿por qué esta capa se dibuja como UNA celda y su número, y no como campo de colores?» | `99 §ADR-035/046/056` |
| «¿hubo tormenta eléctrica / rayos?», «¿por qué no consta una descarga atmosférica?» | `99 §ADR-060` + `35 · L-37` |
| «declaré el dato y el sistema sigue con el valor por defecto» | `30 · L-68` + `99 §ADR-013/052` |
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

> **Esto es un índice, no un segundo historial.** Cada fila lleva el TÍTULO de su ADR y dónde está su
> crudo; el qué, el porqué y el **estado de revisión** viven en `99`, que es su dueño (`§G.3` SSoT).
> Hasta el 21-08 esta tabla repetía un resumen de cada decisión: 48 filas de ~250 caracteres que se
> desincronizaban solas y se llevaban el 79 % del nodo (`99 §ADR-048`).

| ADR | Fecha | Decisión | Crudo de respaldo |
|---|---|---|---|
| `ADR-001` | 2026-07-29 | Arquitectura y stack de la plataforma | `research-archive/2026-07-28-comite-vision-arquitectura.md` |
| `ADR-002` | 2026-07-29 | Integración del Consejo Externo (Gemini 3.1 Pro) | `research-archive/2026-07-29-consejo-externo-respuesta.md` |
| `ADR-003` | 2026-07-29 | El Ingeniero fija alcance y presupuesto | — (decisión del dueño) |
| `ADR-004` | 2026-07-29 | Subsistema de IA y contrato para trabajar en paralelo | `research-archive/2026-07-29-arquitectura-ia-y-paralelo.md` |
| `ADR-005` | 2026-07-29 | Framework del frontend: React 19 como aplicación de una sola página | `research-archive/2026-07-29-comite-framework-frontend.md` |
| `ADR-006` | 2026-07-30 | Exportadores GPX/KML/CSV: paridad de formato con el módulo original, verdad del modelo corregido | `tests/exportar.test.js` |
| `ADR-007` | 2026-07-30 | Auditoría comparativa original-vs-web (7 dimensiones) y Ola 1 de nivel premium | `research-archive/2026-07-30-auditoria-original-vs-web-7-dimensiones.json` |
| `ADR-008` | 2026-07-31 | Décima colección `investigaciones`: el expediente de falla es un tipo de documento propio | bóveda `fixtures/LN-627-falla.json` |
| `ADR-009` | 2026-07-31 | Inventario de brechas y primera tanda de cierre (P0) | `research-archive/2026-07-31-brecha-original-vs-web-8-segmentos.json` |
| `ADR-010` | 2026-08-01 | Cómo se sirven las fotos: un portero delante del almacenamiento | — (sin comité) |
| `ADR-011` | 2026-08-01 | La carga sobre la estructura: pestaña propia, y el contrato que le faltaba | *(`tests/cargas-vista.test.js`)* |
| `ADR-012` | 2026-08-01 | El eje longitudinal: cerrar la deuda que `cargas.js` declaraba | `research-archive/2026-08-01-workflow-eje-longitudinal.json` |
| `ADR-013` | 2026-08-03 | Auditoría adversarial de la ola 4: lo que 564 pruebas en verde no veían | `research-archive/2026-08-03-auditoria-ola-4.json` |
| `ADR-014` | 2026-08-03 | Cerrar los once menores de la auditoría: dueños únicos y frases verdaderas | `research-archive/2026-08-03-auditoria-ola-4.json` |
| `ADR-015` | 2026-08-03 | Una foto puede colgar de un APOYO, y el número del archivo no es el del apoyo | `research-archive/2026-08-03-auditoria-ola-4.json` |
| `ADR-016` | 2026-08-03 | Partir el nodo de lecciones en una madre-índice y tres hijos por tema | `research-archive/2026-08-03-workflow-shard-nodo-30.json` |
| `ADR-017` | 2026-08-03 | La capacidad longitudinal entra al contrato, y el veredicto llega al producto | `research-archive/2026-08-03-workflow-capacidad-longitudinal.json` |
| `ADR-018` | 2026-08-04 | La carcasa «El Horizonte»: la piel clara como control de calidad, no como gusto | `research-archive/2026-08-04-workflow-critica-carcasa.json` |
| `ADR-019` | 2026-08-04 | Cero registro público: el alta de personas es un acto administrativo | *(sin crudo)* |
| `ADR-020` | 2026-08-04 | El segmento RCA: un método instrumentado, y lo que se le prohíbe hacer | `research-archive/2026-08-04-workflow-rca-lineas-at.json` |
| `ADR-021` | 2026-08-04 | El cerebro puede mentir con todos los gates en verde | `research-archive/2026-08-04-auditoria-documentacion-sesion.json` |
| `ADR-022` | 2026-08-05 | El Ingeniero fija el contexto real: herramienta interna, sin cliente ni contrato | `research-archive/2026-07-28-comite-vision-arquitectura.md §J` |
| `ADR-023` | 2026-08-05 | El informe GERENCIAL: derivado entero, y con lo que NO puede afirmar de titular | *(`tests/gerencial.test.js`)* |
| `ADR-024` | 2026-08-06 | La puerta de acceso: dos piezas, tres cerrojos, y dos controles descartados por redundantes | *(`tests/acceso.test.js`)* |
| `ADR-025` | 2026-08-06 | El método RCA contrastado contra IEC 62740: qué se puede firmar, y los tres defectos que destapó | `research-archive/2026-08-06-workflow-rca-vs-iec62740.json` |
| `ADR-026` | 2026-08-07 | Varias causas raíz, cinco familias nuevas y la séptima condición | `research-archive/2026-08-06-workflow-rca-vs-iec62740.json` |
| `ADR-027` | 2026-08-16 | La identidad de un punto nace de su NOMBRE CANÓNICO; las semillas posicionales de julio quedan ancladas en un registro que solo crece | `research-archive/2026-08-16-workflow-mapa-identidad-apoyos.json` |
| `ADR-028` | 2026-08-17 | La carga de puntos se hace DESDE la aplicación: la identidad se acuña en el repositorio y el navegador solo la busca | `research-archive/2026-08-17-workflow-importar-en-la-app.json` |
| `ADR-029` | 2026-08-17 | RECORDAR no es PROPONER: la pantalla le devuelve lo que él ya firmó, con la fecha pegada | `research-archive/2026-08-17-workflow-recordar-no-proponer.json` |
| `ADR-030` | 2026-08-17 | La ficha estructural se puede ESCRIBIR: seis campos, procedencia por campo y el antes/después antes de guardar | *(`tests/ficha-editable.test.js`)* |
| `ADR-031` | 2026-08-17 | Las fotos se suben DESDE la aplicación; el portero deja de ser solo-lectura bajo diez cerrojos | *(`tests/portero.test.js`)* |
| `ADR-032` | 2026-08-19 | Un veredicto calculado sobre un dato que nadie verificó lo dice en el papel — y lo dice el MOTOR, no el papel | *(`tests/informe.test.js`)* |
| `ADR-033` | 2026-08-19 | El sembrador respeta el cerrojo: lo que escribió una persona no se resiembra | *(`tests/sembrar-mapeo.test.js`)* |
| `ADR-034` | 2026-08-19 | Dos capas de imagen sobre el mapa: se ENCIENDE la satelital y entra la temperatura del suelo — con datos abiertos y sin pedirle nada a nadie | *(`tests/mapa-capas.test.js`)* |
| `ADR-035` | 2026-08-19 | El pronóstico entra como capa, pero no como dato: se pide, se mira y se olvida | *(`tests/pronostico.test.js`)* |
| `ADR-036` | 2026-08-19 | La temperatura del suelo deja de ser una imagen y pasa a ser la MEDIDA: doce fechas, y los grados de un punto con un clic | *(`tests/rejilla.test.js`)* |
| `ADR-037` | 2026-08-19 | La capa del suelo se cambia por el RECURSO SOLAR, que sí es una entrada del cálculo | *(`tests/radiacion.test.js`)* |
| `ADR-038` | 2026-08-20 | El lote deja de ser una ausencia declarada: la escritura llevaba meses lista y no había por dónde pedirla | *(`tests/ficha-lote.test.js`)* |
| `ADR-039` | 2026-08-20 | La temperatura del AIRE entra al mapa: la del suelo no alimentaba ningún cálculo, ésta sí | *(`tests/temperatura.test.js`)* |
| `ADR-040` | 2026-08-20 | La satelital se remuestrea en origen, y se dicen los DOS números; a más resolución no se puede ir por LICENCIA, no por técnica | *(`tests/mapa-capas.test.js`)* |
| `ADR-041` | 2026-08-20 | Corrección de criterio: un mapa que no enseña su gradiente no informa, y el zoom tiene que llegar donde llega el ojo | *(`tests/temperatura.test.js`)* |
| `ADR-042` | 2026-08-20 | El mapa como pantalla: pestaña «Detalle GPS», y lo que una revisión adversarial encontró dentro | *(`tests/detalle-gps.test.js`)* |
| `ADR-043` | 2026-08-21 | La satelital SÍ se pintaba: lo roto era la SONDA. Instrumento por instancia y banco de pruebas sin sesión | *(`tests/sonda-mapa.test.js`)* |
| `ADR-044` | 2026-08-21 | El cable de guarda entra al sistema como INVENTARIO de daño, vano a vano, y se pinta sobre el mapa | *(`tests/cable-de-guarda.test.js`)* |
| `ADR-045` | 2026-08-21 | El atlas solar del Caribe: dato horario de 2026 sobre siete departamentos, en su propia pantalla | *(`tests/sol-caribe.test.js`)* |
| `ADR-046` | 2026-08-21 | Una capa que se pinta y no se puede APRECIAR: el criterio de `ADR-041/042` nunca cruzó a la capa hermana | *(`tests/radiacion.test.js`)* |
| `ADR-047` | 2026-08-21 | Mantenimiento integral del cerebro: 28 huecos que el linter no podía ver, y el nodo del mapa se parte | `research-archive/2026-08-21-auditoria-cerebro-6-lentes.json` |
| `ADR-048` | 2026-08-21 | La familia de lecciones se parte por donde ya estaba partida, y el techo real es el ARRANQUE | *(gate de capacidad + `boot-gate`)* |
| `ADR-049` | 2026-08-22 | Triaje de los 51 hallazgos del entorno, y las dos mentiras que salieron vivas del que se dio por cerrado | `research-archive/2026-08-22-triaje-51-hallazgos-entorno.json` |
| `ADR-050` | 2026-08-22 | La escala de verosimilitud son TRES, y una hipótesis rival se cierra yendo a probarla — no con una etiqueta | *(`tests/rca-contrato-parte.test.js`)* |
| `ADR-051` | 2026-08-22 | Lo primero que se ve tiene que ser verdad: la banda, la pestaña, el tope y la versión del motor | *(`tests/tope-de-tiro.test.js` · `tests/banda-y-pestanas.test.js`)* |
| `ADR-052` | 2026-08-22 | El número que se firma: un solo tope de puesta a tierra, y un pendiente que por fin se tacha | *(`tests/umbral-tierra.test.js` · `tests/campos-del-molde.test.js`)* |
| `ADR-053` | 2026-08-22 | Un atlas de temperatura, un solo motor para los dos, y los dos dentro de Detalle GPS | *(`tests/atlas-ficha.test.js` · `tests/atlas-caribe.test.js`)* |
| `ADR-054` | 2026-08-22 | El extremo de ORIGEN entra sin mover a nadie, y un pórtico que estaba a 4,6 km de donde se creía | *(`tests/carga-orden-biseccion.test.js` · `tests/sembrar-mapeo.test.js`)* |
| `ADR-055` | 2026-08-22 | El tiempo del año entero: viento y lluvia entran como atlas, porque un pronóstico no llega hasta diciembre | *(`tests/atlas-ficha.test.js`)* |
| `ADR-056` | 2026-08-22 | El clima del año entra al mapa de la línea, y se resuelve como un dato del sitio y no como un campo | *(`web/src/componentes/ClimaDelAnio.tsx`)* |
| `ADR-057` | 2026-08-22 | El cielo que no informaba: una rama inalcanzable y un día contado desde la madrugada | `research-archive/2026-08-22-pronostico-diagnostico-y-estrategia.md` |
| `ADR-058` | 2026-08-22 | Un solo eje de tiempo para el clima de la línea, del histórico al pronóstico | *(`tests/linea-de-tiempo.test.js`)* |
| `ADR-059` | 2026-08-22 | Los atlas dejan de dar un número suelto y pasan a dar el día, el mes y el veredicto | *(`tests/perfil-del-dia.test.js`)* |
| `ADR-060` | 2026-08-22 | El quinto atlas: la nubosidad entra, y entra diciendo lo que NO puede decir | *(`herramientas/nubes-caribe.mjs`)* |
| `ADR-061` | 2026-08-22 | La escala se publica en la pantalla, no solo se aplica | *(`tests/perfil-del-dia.test.js`)* |
| `ADR-062` | 2026-08-22 | Lo que no se encuentra no existe: el puente al día medido | *(`tests/perfil-del-dia.test.js`)* |
| `ADR-063` | 2026-08-22 | El horizonte sale de «Detalle GPS», y solo de ahí | *(`tests/horizonte-cobertura.test.js`)* |
| `ADR-064` | 2026-08-22 | Cada coordenada del recorrido, no el promedio: la advertencia pasa a ser comprobación | *(`tests/perfil-del-dia.test.js`)* |
| `ADR-065` | 2026-08-22 | Auditoría Nivel-2: el cerebro entrega, pero en parte por recencia — y la recencia se poda | `research-archive/2026-08-22-auditoria-cerebro-nivel2.json` |
| `ADR-066` | 2026-08-22 | Tres huecos de la ola del clima, y el guardián que no podía verlos | *(`tests/estilo-clases.test.js`)* |
| `ADR-067` | 2026-08-22 | Quién es «la línea»: un solo filtro, no uno por pantalla | *(`tests/perfil-del-dia.test.js`)* |
| `ADR-068` | 2026-08-22 | Un solo catálogo de atlas: añadir el sexto es UNA entrada | *(`tests/ruta.test.js`)* |
| `ADR-069` | 2026-08-22 | El clima MIGRA de Detalle GPS al Atlas — entero, no a medias | *(`tests/pronostico.test.js`)* |
| `ADR-070` | 2026-08-22 | El deslizador de la hora vuelve a decir su número | *(`tests/perfil-del-dia.test.js`)* |
| `ADR-071` | 2026-08-22 | El mapa del atlas gana sonda y oído: un mapa mudo no se puede diagnosticar | *(`web/src/componentes/sondaMapa.ts`)* |
| `ADR-073` | 2026-08-22 | El sujeto del atlas es LA LÍNEA, no una celda que haya que buscar | *(`tests/perfil-del-dia.test.js`)* |
| `ADR-074` | 2026-08-23 | El recorrido se DIBUJA sobre el atlas — y el lienzo, por fin, se puede mirar | *(`herramientas/foto-del-banco.mjs`)* |
| `ADR-075` | 2026-08-24 | El vigía mira cada 4 horas, y la pantalla dice de cuándo es lo que enseña | *(`tests/frescura-del-atlas.test.js`)* |
| `ADR-076` | 2026-08-24 | Los dos ajustes del repositorio, hechos — y la trampa del check que traían debajo | *(`.github/workflows/vigia-nasa.yml`)* |
| `ADR-077` | 2026-08-24 | El despliegue automático, listo y con la comprobación puesta — la llave la pone él | *(`.github/workflows/desplegar.yml`)* |
| `ADR-078` | 2026-08-24 | El hora a hora tiene que verse donde se busca | *(`tests/perfil-del-dia.test.js`)* |
| `ADR-079` | 2026-08-24 | El sexto atlas: descargas atmosféricas, contadas por satélite | *(`herramientas/rayos-caribe.mjs`)* |
| `ADR-080` | 2026-08-24 | De dónde viene cada atlas, y dos relojes en vez de uno | *(`.github/workflows/vigia-nasa.yml`)* |
| `ADR-081` | 2026-08-24 | Sol y nubes, de 87 días a quince minutos — sin tapar lo que ya había | *(`herramientas/abi-caribe.mjs`)* |
| `ADR-082` | 2026-08-24 | Los atlas, agrupados por quien publica el dato | *(`web/src/vistas/atlasCatalogo.ts`)* |
| `ADR-083` | 2026-08-24 | Auditoría Nivel-2 del cerebro: lo que envejeció solo en dieciséis ADRs | *(`research-archive/2026-08-24-auditoria-cerebro-nivel2.json`)* |
| `ADR-084` | 2026-08-25 | Cada fuente con su marca, y los ocho atlas en la frontera de su fuente | *(`web/src/componentes/EmblemaFuente.tsx`)* |
| `ADR-085` | 2026-08-25 | La fusión automática se enciende, y el que mira el mapa pasa a ser la máquina | *(`herramientas/mirar-los-atlas.mjs`)* |
| `ADR-086` | 2026-08-26 | El atlas del tiempo que VIENE, y cómo se guarda un pronóstico sin que se confunda con una medición | *(`herramientas/pronostico-caribe.mjs`)* |

> Toda decisión cara de revertir entra aquí con su ADR y su crudo enlazado. Si hubo comité o consejo
> externo y el crudo no está archivado, la tarea **no está cerrada** (`CLAUDE.md §G.4`).
