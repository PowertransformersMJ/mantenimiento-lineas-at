# 🧪 32 — LECCIONES · PANTALLA (Memoria Procedimental)

> Nodo HIJO de `docs/30-LECCIONES.md` (su madre). NO se auto-carga: se consulta **antes** de una
> operación riesgosa o repetitiva (trigger 🧪 de `CLAUDE.md §G.2`). Los `L-NN` conservan su número
> original — se MOVIERON de la madre, no se renumeraron.
> **Qué guarda:** el cálculo salió bien y el usuario ve otra cosa. El camino del dato hasta los
> ojos: despliegue, cachés, imágenes, formato de cifras, densidad y promesas de la interfaz.
> **El MAPA ya no vive aquí:** se partió a `docs/34-LECCIONES-MAPA.md` el 21-08 (`99 §ADR-047`).
> **Se consulta cuando:** el despliegue no se ve · las fotos no cargan · una cifra se lee mal · la
> pantalla promete lo que el archivo no cumple. Qué lección es cada síntoma lo dice el índice de la
> madre (`30`), que es su dueño: aquí no se repite.
> **Hilo común:** nada falla, nada avisa, y lo que se muestra no es lo que el núcleo produjo.
> Formato: `L-NN · título` → **Síntoma** / **Causa** / **Regla**.

---

## Del cálculo a los ojos: despliegue, cifras y promesas

### L-67 · Un guardián que vigila la FUNCIÓN y no a quien la LLAMA cubre media carrera

- **Síntoma:** el 15-08 se arregló «un fallo al guardar destruye la pantalla del análisis», con su
  prueba. Verde desde entonces. Y el 22-08, al triar la auditoría vieja, resultó que en **tres
  sitios** el texto del ingeniero se seguía borrando al fallar el guardado — incluido el enunciado de
  la **causa raíz**, el acto más caro del expediente. Y la franja roja decía, en negrita, *«Lo que
  escribiste sigue en pantalla y no se ha perdido»*: mentía.
- **Causa:** las cuatro funciones que escriben **se tragan el fallo a propósito** —lo convierten en
  la franja, que es lo correcto— y devolvían `void`. Así que su `await` **termina bien aunque no se
  haya escrito nada**, y quien llamaba vaciaba el formulario igual: `setEnunciado('')`, `setR(null)`,
  `setQue('')`. La prueba miraba el estado que la función deja y **nunca a sus llamadores**.
- **Regla:** cuando una función se traga un fallo, **tiene que devolver si funcionó** —aquí,
  `Promise<boolean>`— y el guardián debe recorrer **a quien la llama**, no solo a ella. La pregunta
  que caza esto: *«¿qué hace la pantalla justo DESPUÉS del await?»*. Y si la interfaz promete algo
  («no se ha perdido nada»), esa promesa se prueba: una frase en negrita es una afirmación del
  producto, igual que una cifra.
- **El patrón:** emparenta con `34 · L-65` (una corrección es deuda con toda la familia) y con
  `30 · L-56` (un guardián que no bloquea es un adorno). Aquí el guardián bloqueaba… la mitad
  equivocada. Entera → `99 §ADR-049`.

### L-66 · Una escritura NO recarga la aplicación: parchea lo que la base devolvió

- **Síntoma:** se declara un dato desde la pantalla, la escritura funciona… y la pantalla se congela
  **unos 25 s por cada clic**, con el mapa parpadeando. Declarar los 24 vanos de una línea se iba a
  diez minutos de relojes de arena. Nada falla y ninguna prueba se pone roja: el dato queda bien.
- **Causa:** para «que la pantalla se entere» se llamó a `almacen.cargar()`, que rehace el **arranque
  entero** —sesión, token, permisos, líneas, apoyos, expedientes y fotos— y deja la aplicación en
  fase «cargando», donde `App.tsx` **sustituye la pantalla de la línea**. O sea que cada clic
  destruía y volvía a montar la propia pantalla desde la que se estaba escribiendo.
- **Regla:** tras escribir, **parchea en memoria lo que la escritura DEVOLVIÓ** —el valor y la
  revisión que la base aceptó, nunca lo que se envió— y deja que el cambio de identidad del array
  avise a quien mire. Un recargue completo solo se justifica cuando la escritura pudo cambiar algo
  que la pantalla no puede deducir.
- **Ojo, que es reincidente:** la misma piedra estaba escrita **tres veces** en el mismo archivo
  (`refrescarLinea`, `guardarFicha` y el cable de guarda, `web/src/datos/enlace.ts`). Por eso es
  lección y no comentario: un patrón que se repite en el mismo archivo ya no es un descuido.
  Entera → `99 §ADR-044`.

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
- **REINCIDIÓ el 2026-08-25 (`99 §ADR-085`), y el precio fue arreglar lo que no estaba roto.**
  `foto-del-banco.mjs` abría la tubería de `stderr` de Chrome y **no la leía nunca**. Un atlas de
  seis no arrancó Chrome en el servidor y al registro llegó «no publicó su puerto en 10 s». Sin la
  queja se culpó a la **caja de arena** —plausible y falsa— y se escribió el `--no-sandbox`. Lo
  desmintió el propio registro: los otros CINCO habían abierto Chrome en esa misma corrida. Era
  arranque en frío con la máquina cargada.
  **Abrir una tubería y no leerla es peor que cerrarla:** con `'ignore'` el mensaje sale por la
  consola; con `'pipe'` sin lector se pierde y encima parece capturado. **Y antes de creerse una
  causa, mírese si el resto de casos la desmiente:** cinco verdes al lado de un rojo dicen más que
  el rojo solo.

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

### L-69 · Una rama inalcanzable no da error: da una respuesta creíble y falsa

- **Síntoma:** el pronóstico decía **«nublado»** casi todos los días. Lo vio el Ingeniero antes que
  ninguna prueba.
- **Causa:** la traducción de símbolos buscaba por trozo de texto y preguntaba `cloudy` **antes** que
  `partlycloudy` — que lo **contiene**. La rama de «parcialmente nublado» era inalcanzable para todo
  código posible. Ese día la fuente entregó **50 tramos `partlycloudy` y 11 `cloudy`**, y la pantalla
  pintó los 61 iguales.
- **Por qué sobrevivió:** porque **no falla**: devuelve una etiqueta creíble. El guardián probaba
  cuatro familias sueltas, ninguna era la que chocaba, y el verde era sincero y equivocado.
- **Regla:** en una cadena de `includes`/`startsWith`/`match` **el orden ES la función** —de lo más
  específico a lo más general, con la razón escrita al lado de cada línea que adelanta a otra—, y el
  guardián **recorre el catálogo entero comprobando que NINGUNA rama queda sin alcanzar**: una
  salida inalcanzable es un fallo, no código de más. Que sirve se demuestra reintroduciendo el
  fallo y viéndolo rojo (`30 · L-68`).
- **Hermana de `L-44`** (el tercer estado que la pantalla aplana): dos cosas del núcleo saliendo por
  la misma puerta. Detalle: `99 §ADR-057`.

### L-70 · Buscar «la hora tal» en UTC funciona hasta que la serie cambia de paso

- **Síntoma:** el cielo de los días lejanos lo decidía **la 1 de la madrugada**, con símbolo nocturno.
- **Causa:** se elegía el instante con `getUTCHours() === 17` (mediodía de Colombia). Existe mientras
  la fuente publica paso horario; **desde el cuarto día solo publica bloques de 6 h (00/06/12/18
  UTC)**, el `find` devuelve `undefined` y el respaldo era «el primero del día» = 01:00 local. El
  comentario del propio archivo prometía lo contrario de lo que hacía el código. **Lo traicionero:**
  funciona en los primeros días —los que uno mira al desarrollar— y se rompe solo en la parte del
  horizonte que nadie revisa.
- **Regla:** una hora que significa algo para una persona (*la jornada*, *el cierre*) se busca **en el
  reloj de esa persona**, nunca en el UTC de la fuente, y **por cercanía, no por igualdad**: el paso
  de una serie no es un contrato: cambia a mitad del horizonte. «El primero de la lista» no es un
  respaldo, es otro dato disfrazado del que se pedía. Y si hay que fijar una hora, la que **coincide
  con un sello real en los dos regímenes** (13:00 de Colombia = 18 UTC; las 12:00 no).
- **Hermana de `L-69`**: mismo día, mismo módulo, las dos dando resultados creíbles.

### L-73 · Un icono se juzga a su TAMAÑO REAL — a 3× todo se ve bien

- **Síntoma (2026-08-25, `99 §ADR-084`):** el emblema del satélite se dibujó en un lienzo de 24
  unidades y en el editor se leía perfecto. **En pantalla mide 18 px**: un bulto naranja sobre una
  sonrisa azul.
- **Causa:** la unidad del lienzo no es la de la pantalla. Un trazo de 1,7 en un lienzo de 24 a 18 px
  son **1,3 px reales**, por debajo de lo que el antialiasing conserva. Sin error: el navegador
  dibuja obedientemente algo ilegible.
- **Regla:** un dibujo pequeño **se juzga al tamaño al que se publica**. Si hace falta ampliar, se
  amplía **la foto del tamaño real**, nunca el dibujo. Foto + recorte ampliado = un minuto.
- **Criterio que salió:** a ese tamaño sobreviven las SUPERFICIES, no los trazos, y las formas
  necesitan **hueco visible** o se funden. Comparar variantes en una página suelta es más barato
  que discutirlo.
- Hermana de `34 · L-72` —el lienzo se MIRA— aplicada a lo pequeño.
