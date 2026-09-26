# 🧪 34 — LECCIONES · EL MAPA (Memoria Procedimental)

> Nodo HIJO de `docs/30-LECCIONES.md` (su madre) y HERMANO de `32`, del que se partió el 2026-08-21
> por tope (`99 §ADR-047`). NO se auto-carga: se consulta **antes** de tocar el mapa (trigger 🧪 de
> `CLAUDE.md §G.2`). Los `L-NN` conservan su número original — se MOVIERON, no se renumeraron: los
> cita el código fuente, que el linter no mira.
> **Qué guarda:** el mapa que no llega a pintarse, o que pinta algo que no se puede leer. MapLibre,
> PMTiles, capas raster, capas de MEDIDA, sondas y encuadres.
> **Se consulta cuando:** el mapa sale gris, en blanco o de un solo color · una capa se enciende y
> «no pasa nada» · una sonda dice que el mapa está muerto y está pintando · un gradiente no se ve.
> **Hilo común:** el mapa es una librería IMPERATIVA dentro de un marco declarativo, y casi todos
> sus fallos son de MOMENTO (cuándo se añade la capa) o de ENCUADRE (a qué escala se mira), no de
> dato. Y ninguno se queja: el mapa se queda quieto y todo lo demás dice que va bien.
> Formato: `L-NN · título` → **Síntoma** / **Causa** / **Regla**.

---

## El mapa que no llega a pintarse

### L-65 · Un criterio corregido es una deuda con TODA la familia, no con el módulo donde se descubrió

- **Síntoma:** el Ingeniero enciende la capa de radiación y dice *«no puedo apreciarla»*. Nada falla:
  el paquete servido es el construido, la ficha responde, la rejilla se pinta, el clic devuelve el
  valor y 1.665 pruebas están en verde. La capa es una **mancha de un color**.
- **Causa:** dos correcciones que ESTE proyecto ya había pagado —«la rampa se ajusta al dato»
  (`99 §ADR-041`, `30 · L-61`) y «el problema era el ENCUADRE, no la rampa» (`99 §ADR-042`)— se
  aplicaron a la capa de temperatura y **se quedaron ahí**. La hermana mayor, la del sol, siguió con
  la escala fija (el dato ocupaba el 11 % del rango en la capa por defecto) y sin botón para abarcar
  el recorte. El botón nació **dentro** de una leyenda: por eso no llegó a la otra.
- **Regla:** cuando una corrección se acepta, la pregunta siguiente no es «¿ya está?», es
  **«¿quiénes más son de esta familia?»** — y se recorren. Dos señales de que hay hueco: (1) la
  corrección vive **dentro** de un módulo en vez de en un dueño común, y (2) el módulo hermano tiene
  el mismo comentario de cabecera pero no el mismo remedio. El cierre no es propagar: es dejar un
  guardián que **recorra los hermanos** (aquí: una prueba que exige `alEncuadrar` en las DOS
  leyendas y una sola copia del encuadre).
- **El patrón, más allá de este caso:** el verde no lo ve porque no hay nada roto — hay algo
  **desigual**. Emparenta con `L-62` (una pantalla nueva hereda la doctrina del sitio, no solo el
  aspecto) y con `30 · L-56` (un guardián cuyo resultado no bloquea). Entera → `99 §ADR-046`.

### L-63 · Una sonda GLOBAL no puede medir dos instancias — y la primera víctima es el DIAGNÓSTICO

- **Qué pasó:** `window.__mapaLineas` era UNA variable, el mapa se monta en DOS pantallas y nadie la borraba al desmontar: contestaba por una instancia retirada (`loaded()=false`, estilo vacío) y de ahí salió «hay un mapa muerto recibiendo las capas» — dos sesiones en esa dirección. Peor: **un mapa que pinta perfectamente TAMBIÉN contesta `loaded() === false`**; el síntoma no distingue nada.
- **Regla, tres filos:** (1) si puede haber N de algo, la sonda tiene **N entradas**, con alta y baja —«solo hay uno» caduca sin avisar—; (2) **valídala contra algo que sepas que funciona** antes de diagnosticar con ella (ésta llegó a decir «cero teselas» del callejero, que estaba pintando); (3) con el arreglo puesto, **quítalo y mira si el fallo vuelve**. Entera → `99 §ADR-043`.

### L-58 · «No pasa nada» al pulsar: mira la PESTAÑA antes que el código

- **Síntoma:** se pulsa el interruptor de una capa del mapa y **no pasa nada**. Ni capa, ni error, ni
  una sola petición de red. Se vuelve a pulsar y sigue igual.
- **Causa, la de verdad:** la pestaña estaba **de fondo**. Chrome congela ahí el reloj de animación
  (`L-16`), MapLibre pinta con ese reloj, y su evento `load` —que es la puerta que espera cada capa
  para poder añadir fuentes— **no llega nunca**. `document.visibilityState` decía `hidden` y eso
  explicaba el síntoma entero.
- **⚠️ Lo que costó tres despliegues fue el DIAGNÓSTICO, no el arreglo.** Se persiguieron dos causas
  plausibles —el mapa en un `ref`, que no dispara efectos (pasó al ESTADO); y `isStyleLoaded()` de
  puerta, que contesta «¿está TODO cargado?» y puede no ser `true` nunca (la buena es el evento
  `load`)—. Las dos dejaron cambios correctos por su cuenta, pero **ninguna era el síntoma**.
- **Regla, y es de método:** ante «no pasa nada» sin error ni petición, lo primero es
  `document.visibilityState` y lo segundo tocar OTRO interruptor del panel — si ése responde, no es
  React ni el estado. Verificar en una pestaña de fondo convierte un mapa que funciona en un mapa
  que parece roto, y a quien lo depura le hace inventar causas.

### L-57 · Un efecto de React que enciende su propio «cargando» se cancela a sí mismo

- **Síntoma:** se enciende la capa del pronóstico, la petición SALE, el servicio responde **200**… y
  la pantalla se queda en «consultando…» para siempre. Sin error, sin nada en consola.
- **Causa:** el efecto tenía `pidiendoTiempo` en su lista de dependencias y lo ponía a `true` como
  primera línea. Eso vuelve a disparar el efecto, React ejecuta la LIMPIEZA del pase anterior, y esa
  limpieza marcaba la petición en vuelo como cancelada (`cancelado = true`). Cuando la respuesta
  llegó, ya no había nadie escuchando. El patrón «bandera de cargando + limpieza que cancela» se
  muerde la cola en cuanto la bandera es una dependencia.
- **Arreglo:** el freno pasa a una REFERENCIA (`useRef`), fuera del ciclo de render, y la lista de
  dependencias se queda con lo que de verdad cambia la consulta. Lo único que decide si se puede
  pintar la respuesta es si el componente sigue montado.
- **Regla:** en un efecto que consulta, ninguna bandera que el propio efecto escriba puede estar en
  sus dependencias. Y para diagnosticarlo: mirar la RED antes que el código — ver el 200 con la
  respuesta entera fue lo que descartó de golpe la fuente, la licencia, el CORS y la URL, y dejó el
  fallo donde estaba, en el ciclo de vida.

### L-55 · Una capa raster añadida con el mapa quieto no carga NUNCA, y no se queja

- **Síntoma:** se enciende la capa satelital y el mapa se queda **BLANCO**. La capa existe, la fuente
  existe, `isSourceLoaded()` dice `true`, la atribución aparece abajo… y no hay ni una imagen. Cero
  errores, cero peticiones de tesela. Las pruebas, en verde.
- **Causa:** MapLibre termina de dar de alta una fuente raster esperando un
  `requestAnimationFrame`. Con el mapa quieto ese momento no llega jamás: la fuente se queda a medio
  nacer y nunca pide teselas. `loaded()` dice `true` porque no espera ninguna — no pidió ninguna.
- **Arreglo:** `m.triggerRepaint()` justo después de añadir la capa.
- **Regla:** al añadir una fuente a un mapa YA CREADO, pídele un fotograma. Y ojo al diagnóstico:
  `isSourceLoaded()` contesta «¿me falta algo de lo que pedí?», no «¿tengo algo?». Para saber si una
  capa de imagen está viva hay que mirar la PANTALLA.
- **El acompañante, con su CORRECCIÓN del 21-08:** esperar a `isStyleLoaded()` era la puerta
  equivocada —contesta «¿está TODO cargado?», no «¿está el estilo listo?»— y costó tres despliegues.
  Y **`load` TAMPOCO sirve**: espera también a las teselas, así que si a una fuente le falta una no
  dispara jamás, sin error y sin una petición de red. La puerta buena es **`style.load`**, demostrado
  quitándolo y viendo caer la capa otra vez (`L-63` · `99 §ADR-043`).

### L-15 · El worker de MapLibre nace muerto en producción si no se le da su URL
- **Síntoma:** mapa gris para siempre, sin un solo error. El estilo carga sus 71 capas, el archivo de
  teselas se descarga… y nada se pinta. Sonda interna: el worker existía como objeto, tenía **7
  tareas enviadas y 0 respuestas**.
- **Causa:** el worker autogenerado de MapLibre no arranca en el empaquetado de producción. Y el
  arreglo tiene su propia trampa: `maplibre-gl-worker.mjs` **importa** `./maplibre-gl-shared.mjs`,
  así que servirlo con `?url` a secas lo deja cojo (19 kB) y muere igual de mudo.
- **Regla:** `import urlWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'` +
  `maplibregl.setWorkerUrl(urlWorker)`. El `?worker&url` hace que Vite lo compile como entrada de
  worker **empaquetando sus dependencias** (~468 kB, no 19). Verificación rápida de que quedó bien:
  el tamaño del asset emitido.

### L-72 · «No puedo mirar el lienzo» tenía salida: sin cabeza SÍ pinta — y el tiempo virtual miente
- **Síntoma:** desde `L-16`/`L-63`, todo dibujo de mapa quedaba sin verificar: la pestaña de
  inspección va en segundo plano, MapLibre no pinta ahí y la regla («no se publica dibujo que no se
  pueda mirar») dejaba una sola salida — que lo mirara el dueño. El trabajo de mapas se paraba.
- **Causa:** se estaba confundiendo *la pestaña que tengo* con *un navegador*. Un **Chrome sin
  cabeza** es una pestaña en primer plano para sí misma: `visibilityState` = «visible»,
  `requestAnimationFrame` corre y WebGL pinta por software (SwiftShader).
- **Y la trampa de dentro, medida el 23-08:** con `--virtual-time-budget` la foto sale **a medias**
  —el ráster pintado y **cero capas vectoriales**, porque el trabajador de teselas se queda sin
  turno— y **sin un solo error**. Confirmaría justo lo que no ha ocurrido.
- **Regla:** para mirar un mapa, Chrome sin cabeza + **espera de reloj real** (`--headless=new`,
  `--enable-unsafe-swiftshader`, puerto de depuración y `Page.captureScreenshot`), y el estado que se
  quiere fotografiar **se lleva en la dirección**, porque nadie va a pulsar el botón.
  Herramienta: `herramientas/foto-del-banco.mjs` (`99 §ADR-074`). Y antes de creerse la foto:
  comprobar en ella `visibilityState` y la sonda, que la propia herramienta imprime.
- **Recaída 11-09, sin mapa:** una maqueta con `--virtual-time-budget` y sin alarma colgó 180 s y
  dejó Chrome vivo. La regla vale para **TODA foto sin cabeza**: reloj real y
  `perl -e 'alarm N; exec @ARGV'` delante.

---

### L-16 · Chrome congela el reloj de animación en pestañas ocultas — y eso engaña dos veces
- **Síntoma:** con el worker ya arreglado, el mapa seguía sin pintar **en la pestaña controlada por
  herramientas**: estilo cargado, teselas procesadas, glifos descargados… y cero fotogramas.
- **Causa:** con `visibilityState === 'hidden'`, `requestAnimationFrame` **no dispara jamás**.
  MapLibre pinta con ese reloj y su evento `load` solo llega tras el primer fotograma. Engaña al que
  prueba por herramientas (ve «roto» lo que funciona) y al usuario real, si un vigilante de tiempo
  condena al respaldo a quien abre la página en una pestaña de fondo.
- **Regla:** todo vigilante de carga del mapa cuenta **solo tiempo visible** (acumula entre
  `visibilitychange`). Y al verificar por herramientas: si nada pinta pero nada da error, comprobar
  `visibilityState` y la latencia de `requestAnimationFrame` ANTES de diagnosticar el código.

---

### L-71 · Un resumen de OTRO ámbito, puesto al lado del número, destruye la capa entera

- **Síntoma:** «En la celda de esta línea: **32,5 °C**» y debajo «Máxima del día: **29,79 °C**». Una
  máxima MENOR que un valor del mismo día.
- **Causa:** el primero era de la celda de la línea; el segundo, la mediana de toda la REGIÓN. Cada
  uno correcto por separado; juntos y sin rótulo, uno de los dos tenía que estar mal.
- **Lo grave no es ese dato:** quien lo ve **deja de fiarse de la capa entera**, y hace bien — no
  puede saber cuál de los dos falla, así que descarta los dos, incluido lo que sí era correcto.
- **Regla:** el ÁMBITO es parte del número, igual que la unidad (`29,79` sin «de la región» está tan
  incompleto como sin el `°C`). Dos magnitudes de ámbito distinto —esta celda / la región, este vano
  / la línea— no van seguidas sin que cada una diga el suyo en su renglón; y la que no se pidió va
  **después y rotulada como comparación**.
- **Corolario:** ese resumen no se borra por estorbar. Era información válida MAL COLOCADA — se
  rotula y se baja. Tirarla habría sido cambiar un error por otro.
- **Hermana de `L-44`.** Detalle: `99 §ADR-059`.

---

### L-74 · Al MUDAR una capa de pantalla, la que miente no es la capa: son las frases de al lado

- **Síntoma:** las dos capas finas del corredor se mudaron al atlas (`99 §ADR-087`), pintaron
  perfecto, el portero dijo que sí y **1.990 pruebas quedaron en verde**. En la foto, encima del
  mapa, se leía: «**NASA POWER (MERRA-2)** · trae **dato medido hasta el 23 de agosto**» — sobre un
  promedio de **1994-2025** del Global Solar Atlas. Fuente, naturaleza y fecha equivocadas, las tres
  afirmadas con seguridad y sin un error en consola.
- **Y no era una:** eran **tres**. La entradilla seguía diciendo «cada cuadro es una celda de **1°**
  (unos 111 km) … se pinta a cuadros porque a cuadros es como está medida» con celdas de 2 km
  interpoladas en pantalla; y el pie decía «a este encuadre la línea se ve como un punto» justo
  cuando la capa acababa de llevar el mapa al corredor y la línea era lo más grande de la pantalla.
- **Causa:** una frase no es del componente que la escribe, es **del encuadre y del dato que
  acompaña**. Al mudar la capa, el texto que la explicaba se quedó atrás — y el que había en la casa
  nueva se quedó hablando de otra cosa. Cada una era VERDAD donde nació.
- **Por qué no lo caza una prueba:** todas las piezas siguen haciendo lo suyo. La cinta imprime bien
  la ficha del atlas; la entradilla describe bien la celda del atlas. Lo que falla es que **describen
  algo que ya no está en pantalla**, y eso solo se ve mirando la pantalla entera a la vez.
- **Regla:** al mudar una capa a otra pantalla, se hace inventario de **todo lo que afirma** esa
  pantalla —cinta, entradilla, pie, rótulos— y de cada frase se pregunta *«¿sigue siendo verdad con
  esto puesto?»*. Las que no, se bifurcan o se callan. Y **se hace la foto y se LEE entera**, no solo
  se comprueba que el mapa tenga dibujo: el portero dice si hay algo dibujado, no si lo que está
  escrito al lado es cierto.
- **Hermana de `30 · L-68`** («arreglado donde se veía, vivo en la pieza hermana»): aquí es lo
  contrario y la misma familia — la pieza no se tocó, y por eso quedó mintiendo. Detalle:
  `99 §ADR-087`.

---

### L-94 · Un atlas puede estar ENTERO, COMPLETO y en rango — y estar del revés

- **Síntoma (24-09):** la validación de las **once capas** salió limpia. Los píxeles con dato
  cuadraban *exactamente* con lo que promete cada ficha; los tres pronósticos se declaraban como
  tales, vivos y en rango. **Y los tres salían espejados de norte a sur.**
- **Causa:** el pronóstico calculaba la latitud con `SUR + fy` y el atlas medido con
  `NORTE - fy - 0.5`. Misma rejilla, misma pantalla, **resultado invertido**: La Guajira enseñaba el
  tiempo de Córdoba, y ninguna fila quedaba bien — de **111 km** en el centro a **555 km** en los
  extremos.
- **Por qué no lo cazaba NADA:** todo control miraba **cuánto** y **si hay** — el portero, si hay
  dibujo; el validador, si el lienzo cuadra con su ficha; las pruebas, si los valores caben.
  **Ninguno miraba DÓNDE.** La geometría no tenía dueño.
- **Regla:** de una capa georreferenciada hay que comprobar **tres cosas, no dos**: que el dato esté,
  que el dato quepa, y que el dato esté **EN SU SITIO**. Lo tercero se comprueba con una **aserción
  determinista al construir** —la fila 0 es la más al norte, y la celda (0,0) de una familia cae
  donde la (0,0) de la otra—, no con estadística.
- **Descartado:** cazarlo correlacionando pronóstico contra medido *suena* mejor y es peor —
  **nunca comparten horas**, en lluvia es ruido, y al cambiar de mes no hay con qué comparar.
- Detalle: `99 §ADR-142`. Hermana de `L-74`: allí mentían las frases de al lado; aquí, el sitio.

---

### L-95 · Dos decodificadores para un formato son un decodificador y una mentira esperando

- **Síntoma (24-09):** el panel de rayos **escribía un número y el mapa pintaba otro** — mal en
  **553 de 755 horas (73 %)**, con un peor caso de **230 escritos donde el mapa pintaba 5.350**, que
  la ficha imprimía **tres líneas más arriba, en la misma pantalla**.
- **Causa:** una **segunda copia** de la fórmula del byte, escrita a mano y solo lineal, que ignoraba
  la curva `exacta-y-log` que la ficha de los rayos declara. El decodificador bueno existía y estaba
  bien; simplemente no se usaba en ese panel.
- **Lo traicionero:** el segundo **no se entera el día que el formato crece**, y nadie lo nota
  **porque sigue dando un número creíble**. No falla: miente donde nadie mira.
- **Regla:** un formato tiene **un solo dueño que lo convierte**, con guardián que prohíbe
  reescribir la fórmula fuera de él (`tests/un-solo-decodificador.test.js`): se **importa**, no se
  recuerda.
- **Cómo se prueba:** metiéndole a propósito una segunda copia — un guardián que nunca ha dicho que
  no, no se sabe si sabe decirlo (`L-97`).
- Detalle: `99 §ADR-142`.

---

### L-96 · Un escalón que se traga el fenómeno: la llovizna que no cabe en 0,25 mm/h

- **Síntoma (24-09):** la ficha de lluvia dice **262 días con lluvia**; el lienzo hora a hora enseña
  **uno**. Las dos cifras salen del mismo dato y ninguna está corrupta.
- **Causa:** el lienzo horario codifica con un **escalón de 0,25 mm/h** y en el Caribe casi toda la
  lluvia es **llovizna por debajo de ese umbral**: se guarda como cero. El resumen diario no pasa por
  ese escalón — por eso ve lo que el lienzo no ve.
- **La trampa:** el escalón se eligió mirando el **máximo** (que quepa el aguacero), no el **mínimo**
  (que se vea la llovizna). Con 255 peldaños lineales, cubrir 63 mm/h cuesta borrar el 0,2.
- **Regla:** la pregunta no es solo *«¿cabe el máximo?»* sino *«¿qué se pierde en el suelo, y ese
  suelo es el fenómeno?»*. Con el interés abajo —lluvia, rayos— la respuesta es **curva
  logarítmica**, como ya hace la capa de rayos, no reparto lineal.
- **Consecuencia viva:** por esto la *memoria de lluvia desde enero* que pidió el Ingeniero **no se
  puede dar todavía** (`10 · TODO-106`). Detalle: `99 §ADR-142`.

---

### L-97 · El validador también es código, y el mío tenía un error de uno

- **Síntoma (24-09):** escribiendo el validador de atlas estuve a punto de **reportarle una avería
  falsa** en la capa de rayos. El fallo era mío: decodifiqué con `offset + byte × paso` olvidando que
  **el byte 0 está RESERVADO** («sin dato») y que la fórmula es `(byte − 1) × paso + offset`.
- **Lo que lo salvó:** contrastar el resultado del validador contra un número que la propia pantalla
  ya imprime. No una prueba nueva: **un número que ya existía y que tenía que coincidir**.
- **Regla:** una herramienta de verificación **no se estrena contra producción**. Se estrena contra
  un caso cuyo resultado ya se conoce, y —si es un guardián— contra un caso falso metido a propósito,
  para ver si **sabe decir que no**. Los tres guardianes de esta tanda se validaron así.
- **Corolario amargo:** un validador roto es **peor que no tenerlo**: gasta la confianza del
  Ingeniero en averías que no existen y da por buenas las que sí.
- Detalle: `99 §ADR-141/142`. Hermana de `33 · L-46`.
