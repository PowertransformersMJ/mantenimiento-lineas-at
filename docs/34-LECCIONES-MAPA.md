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
  plausibles antes de mirar lo obvio, y las dos dejaron cambios que se quedan porque son correctos
  por su cuenta —pero **ninguna era el síntoma**:
  1. el mapa vivía en un `ref`, y una referencia no dispara efectos: si un efecto de capa cae en el
     instante en que la referencia es `null`, sale y no vuelve. El mapa pasó al ESTADO;
  2. la puerta era `isStyleLoaded()`, que no contesta «¿está el estilo listo?» sino «¿está TODO
     cargado?» y puede no ponerse en `true` nunca (esto sí produjo un error real:
     «Style is not done loading»). La puerta buena es el evento `load`.
- **Regla, y es de método:** ante «no pasa nada» sin error ni petición, la primera comprobación es
  `document.visibilityState` y la segunda es tocar OTRO interruptor del mismo panel — si ése
  responde, el problema no es React ni el estado. Automatizar la verificación en una pestaña de
  fondo convierte un mapa que funciona en un mapa que parece roto, y a quien lo depura le hace
  inventar causas.


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
