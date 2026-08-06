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
- **Tres cachés en serie, y cada una engañó una vez:**
  1. **El comando miente.** `npm run deploy` imprime *"Deployment complete"* y el dominio raíz sigue
     sirviendo el paquete ANTERIOR un rato: el alias propaga por el borde con retraso propio.
  2. **El HTML manda.** `index.html` decide QUÉ paquete se pide; con el HTML viejo en caché se sigue
     pidiendo el JavaScript viejo aunque el nuevo esté publicado. `web/public/_headers` fija
     `no-cache` para el HTML y caché eterna para `/assets/*`, que llevan huella en el nombre.
  3. **El navegador tiene la suya.** Que `curl` vea el hash nuevo NO significa que Chrome lo vea:
     sirvió su HTML cacheado tres veces seguidas —incluso con `?recarga=N`, que cambia la URL pero
     no lo guardado—, así que la pantalla verificada era la ANTERIOR y dos defectos pasaron por
     buenos.
- **Regla, en dos comprobaciones:** contra el borde, `curl -s https://…/ | grep -o
  'assets/index-[^"]*\.js'` frente a `ls web/dist/assets/`; contra el navegador, **preguntarle a la
  pestaña qué cargó** (`[...document.querySelectorAll('script[src]')].map(s => s.src)`) y recargar
  en duro. Y a quien verifique, decirle siempre que recargue forzado. Es §3.2 aplicado al despliegue.
- **El remedio que sí funciona sin tocar el teclado del Ingeniero** (2026-08-03): desde la propia
  pestaña, `await fetch(location.origin + '/', { cache: 'reload' })` revalida el DOCUMENTO en la
  caché HTTP; el `location.reload()` siguiente ya trae el paquete nuevo. Cambiar la consulta
  (`?v=algo`) NO sirve: la entrada cacheada del documento sigue ahí.

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
