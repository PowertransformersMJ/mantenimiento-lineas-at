# 🧪 32 — LECCIONES · PANTALLA (Memoria Procedimental)

> Nodo HIJO de `docs/30-LECCIONES.md` (su madre). NO se auto-carga: se consulta **antes** de una
> operación riesgosa o repetitiva (trigger 🧪 de `CLAUDE.md §G.2`). Los `L-NN` conservan su número
> original — se MOVIERON de la madre, no se renumeraron.
> **Qué guarda:** el cálculo salió bien y el usuario ve otra cosa. El camino del dato hasta los
> ojos: despliegue, cachés, mapa, imágenes, formato de cifras, densidad y promesas de la interfaz.
> **Se consulta cuando:** «desplegué, dijo *Deployment complete* y la pantalla sigue igual»
> (`L-18`, tres cachés en serie) · «el mapa es un rectángulo gris y no hay ni un error» (`L-15`, el
> worker de MapLibre nace muerto en el empaquetado; `L-16`, Chrome congela el reloj de animación en
> pestañas ocultas y engaña al que verifica) · «los marcos de las fotos están y las fotos no»
> (`L-30`) · «ese número está mal escrito»: el informe dice 1.726 y en Colombia se lee mil
> setecientos veintiséis (`L-26`) · «esto se ve pobre, se ve muy oscuro» (`L-21`: casi nunca es la
> paleta, es la densidad) · «la pestaña promete algo que el archivo exportado no cumple» (`L-20`) ·
> «salen 24 párrafos y 22 son iguales» (`L-27`).
> **Hilo común:** nada falla, nada avisa, y lo que se muestra no es lo que el núcleo produjo.
> Formato: `L-NN · título` → **Síntoma** / **Causa** / **Regla**.

---

## El mapa que no llega a pintarse

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

## Del cálculo a los ojos: despliegue, cifras y promesas

### L-18 · Un despliegue no está vivo hasta que lo ves EN LA PESTAÑA
- **Tres cachés en serie, y cada una engañó una vez:** el comando imprime *"Deployment complete"* y
  el dominio raíz sirve el paquete ANTERIOR un rato (el alias propaga con retraso) · el `index.html`
  decide QUÉ paquete se pide, así que con el HTML viejo en caché se sigue pidiendo el JavaScript
  viejo (`web/public/_headers` fija `no-cache` al HTML y caché eterna a `/assets/*`, que llevan
  huella) · y el navegador tiene la suya: que `curl` vea el hash nuevo NO significa que Chrome lo
  vea — sirvió su HTML cacheado tres veces seguidas y dos defectos pasaron por buenos.
- **Regla, en dos comprobaciones:** contra el borde, `curl -s https://…/ | grep -o
  'assets/index-[^"]*\.js'` frente a `ls web/dist/assets/`; contra el navegador, **preguntarle a la
  pestaña qué cargó** (`[...document.querySelectorAll('script[src]')].map(s => s.src)`) y recargar en
  duro. Es §3.2 aplicado al despliegue.
- **El remedio sin tocar su teclado** (2026-08-03): desde la pestaña,
  `await fetch(location.origin + '/', { cache: 'reload' })` revalida el DOCUMENTO; el
  `location.reload()` siguiente ya trae el paquete nuevo. Cambiar la consulta (`?v=algo`) NO sirve.


### L-20 · La pantalla no puede prometer lo que el archivo no cumple
- **Síntoma:** la pestaña Exportar afirmaba *"Todos llevan su procedencia adentro"*. Era falso para
  uno de los cuatro: el CSV de datos crudos NO la lleva, porque una cabecera de comentarios rompe el
  formato RFC 4180 que esperan QGIS, pandas y R.
- **Regla:** toda promesa de la interfaz sobre un entregable se comprueba contra el entregable
  GENERADO, no contra la intención. Si un formato no puede cumplirla, la pantalla dice **cuál** y
  **por qué** — aquí, que ese archivo declara su procedencia columna por columna en vez de en
  cabecera. Una promesa general que falla en un caso es peor que una promesa con su excepción
  escrita: la primera se descubre delante del cliente.

### L-21 · "Se ve muy oscuro / no se ve de alto nivel" casi nunca es la paleta
- **Síntoma:** el Ingeniero pidió *"un entorno igual al archivo html, el que tenemos es muy oscuro"*.
  La reacción fácil era aclarar el tema.
- **Qué se encontró al ABRIR el original al lado** (en localhost desde el área temporal, nunca desde
  `web/public/`, que habría publicado datos de cliente): **el original es igual de oscuro y usa la
  misma paleta exacta** (`--bg:#0f1419`, `--acc:#f0a500`). Aclararlo habría empeorado el problema.
- **La causa real era la DENSIDAD:** el original es un tablero a pantalla completa
  (`grid-template-columns:1fr 420px; height:calc(100vh - 74px)`), base 14 px, títulos de 11,5 px en
  mayúsculas con filete. El nuestro era una columna de 1080 px con letra de 15 px: leía como un blog.
- **Regla:** ante una queja de aspecto, **abrir la referencia y medirla** (paleta, anchos, tamaños)
  antes de tocar un color. El "alto nivel" en una herramienta de ingeniería viene de densidad,
  alineación y jerarquía — no de luminosidad. El tablero usa toda la pantalla; **la prosa se acota**
  (110ch).

### L-26 · El núcleo escribe con PUNTO decimal, y en Colombia el punto son miles
- **Síntoma:** la frase estrella de la pestaña Cargas decía *"multiplica la tensión por 1.726"*. En
  es-CO eso se lee **mil setecientos veintiséis**. Igual en Resumen (*"Quiebre de 118.2°"*), en
  Cantidades y en el semáforo de cada ficha: cuatro pantallas, el mismo defecto, desde antes.
- **Por qué existe y por qué NO se arregla en el núcleo:** el núcleo arma su prosa con `toFixed` y
  jamás con `toLocaleString`, a propósito — el formateo regional depende del ICU de la máquina y un
  veredicto no puede decir una cosa en la Mac del Ingeniero y otra en el CI. La decisión es correcta;
  lo que faltaba era traducir **al pintar**.
- **Regla:** toda prosa que venga de `nucleo/` o `exportar/` pasa por `vistas/formato.ts ·
  textoNucleo()` antes de llegar a pantalla — y **también el TÍTULO**, no solo el detalle: los
  hallazgos llevan la cifra en el renglón que se lee de un vistazo. Sustituye solo el punto con
  dígito a los dos lados, así que «2.929 m» (miles, ya formateado con `nf`) y `docs/40 §8` no se
  tocan. Corolario: **no escribir números de versión dentro de la prosa** — «v0.2.0» sale «v0,2.0».

### L-27 · Una nota que el núcleo escribe POR FILA no se pinta por fila
- **Síntoma:** la sección «apoyo por apoyo» de Cargas imprimía 24 párrafos, 22 de ellos idénticos.
  Las TRES filas que decían algo distinto —los apoyos que amplifican la tensión— quedaban enterradas.
- **Por qué el núcleo tiene razón igualmente:** cada fila debe poder imprimirse SOLA en un informe,
  así que su nota tiene que viajar completa dentro de ella. El error era de la pantalla, no del dato.
- **Regla:** al listar observaciones de muchas entidades, **agrupar por texto idéntico** y ordenar de
  lo específico a lo general (lo que le pasa a un apoyo es un hallazgo; lo que les pasa a los 24 es
  contexto). Y la agrupación vive en la capa pura, no en el componente: es una decisión de lectura,
  y se prueba.

### L-35 · `deploy` NO construye: se puede desplegar un `dist/` rancio y no enterarse
- **Síntoma:** se arregla un detalle (el separador decimal del factor de amplificación), se
  commitea, se despliega, se espera la propagación **y la comprobación da VERDE**… pero producción
  sigue sirviendo el paquete anterior y el punto decimal sigue ahí.
- **Causa:** la cadena usada fue `npm test && git commit && git push && npm run deploy`. El script
  `deploy` del workspace `web` es solo `wrangler pages deploy dist`: **no construye nada**. Se subió
  el `dist/` de la fase anterior, intacto.
- **Lo que hizo el fallo INVISIBLE, y es lo grave:** la comprobación de propagación compara lo que
  sirve producción contra `web/dist/index.html`. Si `dist/` está rancio, se está comparando el
  artefacto viejo contra sí mismo: **la verificación pasa siempre**. Es la familia de «verde no
  prueba nada» (`30 · L-33`) aplicada al despliegue — el oráculo estaba contaminado por la misma
  causa que el defecto.
- **Regla:** el despliegue es `npm run build && npm run deploy --workspace web`, en ese orden y sin
  saltarse el primero. Está escrito así en `docs/10` desde el principio; el atajo fue mío.
- **Cómo se detecta en 10 segundos:** preguntarle a la PESTAÑA qué paquete cargó
  (`[...document.querySelectorAll('script[src]')].map(s => s.src)`) y contrastarlo con el hash que
  acaba de imprimir `vite build` — **no con el contenido de `dist/`**. El navegador es el único
  testigo que no comparte la causa del fallo con el artefacto que se está juzgando.

### L-36 · ⇢ PUNTERO a `31 · L-22` — y la recaída, que es lo que hay que leer
> **El cuerpo de esta lección NO vive aquí.** El dueño es
> **`31 · L-22` · «Desplegar el código sin desplegar las reglas de Firestore: el dato existe y no
> llega»**, que lo dice completo y con el remedio de los tres despliegues. El número `L-36` se
> conserva porque `docs/10` y este nodo lo citan, y los `L-NN` no se renumeran jamás.

- **Qué pasó de verdad el 04-08-2026:** se añadió la colección `analisis`, la pantalla dijo
  *«Missing or insufficient permissions»*, se perdió la tarde depurando el cliente… y al final se
  escribió esta lección **sin ver que `L-22` ya existía, escrita días antes por el mismo síntoma**.
- **Por qué se escapó, que es lo valioso:** el síntoma es de PANTALLA y la causa es de PROVEEDOR.
  Se buscó en el hijo equivocado. Desde que la familia de lecciones se repartió por tema
  (`99 §ADR-016`), un gotcha con el síntoma en un tema y la causa en otro **queda invisible** para
  quien busca por donde le duele.
- **Regla operativa que sale de esto:** ver `30 · L-39` — antes de escribir un `L-NN` nuevo se busca
  el mensaje de error literal en los CUATRO archivos, no el tema.
- **El remedio, por si llegaste aquí con el error delante:**
  `npx firebase deploy --only firestore:rules --project mantenimiento-lineas-at`. Si una consulta
  nueva falla con «insufficient permissions» y el código es correcto, la regla no está en
  producción: no se depura el cliente.

### L-30 · `loading="lazy"` no carga URLs `blob:` — y el fallo se lee como «faltan los datos»
- **Síntoma:** la galería del expediente pintaba los cuatro marcos con sus pies de foto y **ninguna
  imagen**. Todo lo demás estaba bien: el token, el portero, R2 y la red.
- **Causa:** el `<img loading="lazy">` nunca seleccionaba la fuente — `currentSrc` VACÍO y
  `complete: false` aun estando a la vista y con `scrollIntoView` hecho. El binario ya estaba
  descargado (comprobado a mano: el blob era un JPEG válido, cabecera `FF D8 FF E0`, y una
  `new Image()` con esa misma URL cargaba 1051×1400 al instante).
- **Regla:** con URL `blob:`, NO se usa `loading="lazy"`. Y no se pierde nada: cuando ese elemento
  se pinta, el binario YA se bajó —por eso existe el blob—, así que diferir la PINTURA de algo que
  está en memoria no ahorra ni una petición.
- **Cómo se diagnostica en 30 segundos, sin adivinar:** comparar el elemento real contra una
  `new Image()` con el mismo `src`. Si la copia carga y el original no, el problema es del ELEMENTO
  (atributos, estilos, ciclo de vida), no del dato ni de la red. Aquí ese contraste separó «no
  llegan las fotos» de «llegaron y no se pintan», que son dos investigaciones distintas.

### L-44 · Un tercer estado que la pantalla aplana se convierte en un aprobado

- **Síntoma:** la tabla «Vano a vano» cerraba con *«Todos los vanos caen dentro de la banda 0,7–1,3
  respecto al VIR de su tramo»* — incluyendo los vanos que **nunca se compararon**. Se pintaban
  exactamente igual que uno verificado y correcto.
- **Causa:** `nucleo/vanos.js` devuelve `fueraDeRango` de TRES estados —`true`, `false` y `null`
  cuando no hubo VIR contra el que comparar— y la pantalla lo leía con `if (f.fueraDeRango)`. En
  JavaScript `null` es falso, así que «no se pudo evaluar» y «se evaluó y está bien» acababan en la
  misma rama. El comentario del núcleo YA avisaba de que «`false` diría que está dentro de rango».
- **Lo que hace esto especialmente sucio:** el informe imprimible **sí** los distinguía, y el CSV del
  mismo exporte escribía «no evaluable» en esa misma fila. O sea que tres salidas del mismo dato
  decían dos cosas distintas, y la que se mira todos los días era la que mentía.
- **Regla:** un campo de tres estados se lee con `=== true` y `=== false`, nunca por veracidad. Y la
  frase de cierre —«todo bien», «todos dentro», «sin hallazgos»— **solo se escribe cuando el conjunto
  no evaluado está vacío**. Si hay huecos, se cuentan aparte y se dicen: no están dentro ni fuera,
  no se han mirado.
- **Hermana de `L-40`** (deducir el hecho de otra cosa) y de la falta que `99 §ADR-018` cerró en el
  horizonte con los dos ejes: la misma familia, distinto sujeto.

### L-48 · Silenciar `stderr` convirtió un guion que reventó en un guion que "funcionó"

- **Síntoma:** el guion imprimió «textos corregidos · imagen sustituida», el archivo abría bien… y la
  lámina seguía diciendo lo viejo. Tres intentos dándolo por guardado.
- **Causa:** se lanzó con `2>/dev/null`. El guion abortaba ANTES del `save()` y el traceback iba al
  agujero; lo que se leyó como confirmación era un `print` de una línea anterior al fallo — **el
  mensaje de éxito lo emitía código que se ejecuta antes de que exista el éxito**. Y costó verlo
  porque nada estaba roto: simplemente nada había cambiado.
- **Reglas:** nunca `2>/dev/null` en algo que ESCRIBE (si el ruido molesta, se filtra por patrón) ·
  el mensaje de éxito se imprime DESPUÉS de releer lo guardado, y dice lo que se leyó · lo que no se
  puede comprobar, se hace fallar (`assert viejo in s` antes de sustituir).
- **Hermana de `L-35`** y del mismo tronco que `30 · L-33`: miré la salida equivocada y la di por
  buena.

### L-49 · Volver a guardar un `.pptx` clonado con python-pptx lo deja inservible

- **Síntoma:** abrir el mazo con `Presentation()` y hacer `save()` — sin tocar una sola forma —
  produce un archivo que python-pptx relee tan campante y que **LibreOffice rechaza**: *«no se pudo
  cargar el archivo de origen»*.
- **Causa:** el aviso lo daba el propio `zipfile` y yo lo estaba tapando (ver `L-48`):
  `UserWarning: Duplicate name: 'ppt/slides/slide6.xml'`. El mazo se construyó CLONANDO una lámina
  de la plantilla del Ingeniero, y al reescribir el paquete dos partes reclaman el mismo nombre. El
  zip acepta duplicados; el lector de OOXML, no.
- **Cómo se detecta en un segundo:** `len(nombres)` contra `len(set(nombres))` sobre el `.pptx`. El
  respaldo previo daba 0 duplicados y el recién guardado, 2: eso señaló el guardado, no el origen.
- **Regla:** en un mazo con láminas clonadas, **se edita a nivel de zip** — reescribir entrada por
  entrada y sustituir solo el XML o el binario que toca. Preserva todas las relaciones, no renumera
  nada y no puede duplicar partes. El guion queda en la bóveda (`entregables/armar.py`) y reconstruye
  siempre desde el respaldo limpio, nunca encima de su propia salida.
- **Corolario que casi cuesta otro error:** al sustituir una imagen, identificarla por el `r:embed`
  de SU forma, no por «el PNG más grande de la lámina». Con ese criterio cambié `image32.png`
  mientras el mapa era `image9.png`, y el resultado fue un archivo correcto con la figura vieja.
