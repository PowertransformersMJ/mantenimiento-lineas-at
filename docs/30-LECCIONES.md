# 🧪 30 — LECCIONES (Memoria Procedimental)

> Nodo de experiencia. NO se auto-carga: se consulta **antes** de una operación riesgosa o repetitiva
> (trigger 🧪 de `CLAUDE.md §G.2`). Cada lección es un gotcha que ya se pagó una vez.
> Formato: `L-NN · título` → **Síntoma** / **Causa** / **Regla**.

---

## Plataforma y proveedores

### L-01 · GitHub Pages no puede servir este proyecto
- **Síntoma:** parece la opción obvia y gratis para publicar el frontend, y el proyecto hermano ya la usa.
- **Causa (verificado contra la documentación oficial, 2026-07-29):** tres bloqueos independientes.
  (a) Publicar desde **repositorio privado** exige GitHub Pro como mínimo; con cuenta Free el repo
  tiene que ser público — cita literal: *"If the account that owns the repository uses GitHub Free…
  the repository must be public."*
  (b) Aun pagando Pro, **el sitio publicado sigue siendo público** en internet; restringir quién lo ve
  exige Enterprise Cloud a nivel de organización.
  (c) Los términos **prohíben el uso comercial**: *"not intended for or allowed to be used as a free
  web-hosting service to run your online business… or providing commercial software as a service"*,
  y añaden que no debe usarse para transacciones sensibles como envío de contraseñas.
- **Regla:** este proyecto maneja datos de cliente y necesita repo privado → **GitHub Pages queda
  descartado como hosting**. GitHub se usa para el código y el CI, no para servir la aplicación.

### L-02 · "Gratis" y "sin tarjeta" no son lo mismo — y aquí la tarjeta ya está puesta
- **Síntoma:** se arranca con la premisa "presupuesto cero = no dar tarjeta" y eso descarta opciones
  buenas por un motivo que resultó falso.
- **Causa:** dos hechos verificados. (1) En Firebase, **Cloud Storage y Cloud Functions no existen en
  el plan gratuito Spark**: la tabla de precios marca literalmente *Not applicable* y exigen el plan
  **Blaze** con método de pago (Storage desde el 30/10/2024; Functions desde antes). Dentro de Blaze
  sí hay cuota sin costo. (2) El proyecto hermano `lordpowertransformersmj` **ya tiene Blaze activo
  desde el 2026-07-23**, con alerta de facturación en 5 USD/mes.
- **Regla:** la restricción real no es *"sin tarjeta"* sino **"sin factura sorpresa"**. Se evalúan las
  opciones por su **cuota gratuita y su curva de coste**, no por si piden método de pago. Toda opción
  que se adopte lleva alerta de presupuesto configurada antes de recibir tráfico real.

### L-03 · MapTiler gratis prohíbe el uso comercial; Protomaps no
- **Síntoma:** el plan Free de MapTiler parece suficiente (5.000 sesiones/mes) y es fácil de integrar.
- **Causa:** su licencia limita el plan Free a *"non-commercial use and research & development"*, y
  además **prohíbe el caché de servidor** y la descarga masiva de teselas — que es exactamente lo que
  hace falta para tener mapa offline en campo. El primer plan que permite uso comercial cuesta 30
  USD/mes. Las teselas públicas de OpenStreetMap tampoco están pensadas para producción.
- **Regla:** el mapa se sirve con **Protomaps / PMTiles** desde almacenamiento de objetos: un solo
  archivo servido por HTTP Range Requests, licencia BSD, datos ODbL con atribución a OpenStreetMap,
  sin cuota, sin contrato y **funciona offline por diseño**. Es la única opción que satisface a la vez
  "legalmente segura para una empresa" y "sirve sin señal".

### L-04 · A esta escala, el coste de almacenamiento NO es el criterio de decisión
- **Síntoma:** el instinto dice que las fotos van a disparar la factura y que hay que optimizar por
  precio de almacenamiento y de tráfico de salida.
- **Causa:** se hicieron los números con la medida real (LN-627: **99 fotos, 17,97 MB, 182 KB por
  foto**). Incluso con **400 líneas inspeccionadas dos veces al año durante cinco años** el acumulado
  son **70 GB ≈ 1,35 USD/mes**. Y el tráfico de salida con 25 usuarios revisando 200 fotos diarias son
  19 GB/mes, muy por debajo de los 100 GB/mes gratuitos de Firebase.
- **Regla:** no se elige el stack por el precio del gigabyte, porque durante años será calderilla en
  cualquiera de las opciones. Se elige por **capacidad offline** y **mantenibilidad**. Cuando alguien
  argumente "es más barato", pedirle el número: casi siempre está optimizando lo que no duele.

---

## El módulo de campo original

### L-05 · El valor del HTML de 30 MB no es el HTML: son 115 funciones de ingeniería
- **Síntoma:** tentación de tratar el archivo como un prototipo desechable y reescribirlo de cero.
- **Causa:** el 92 % del archivo (27,7 MB) son imágenes en base64 y un DOCX embebido. El código real
  son ~2,4 MB, y dentro de ellos está el criterio de ingeniería acumulado: Vincenty, tramos de
  tensión, VIR, catenaria, cambio de estado, IEEE 738, cargas de viento, validaciones de coherencia.
- **Regla:** el núcleo de cálculo se **porta**, no se reescribe. Vive en `nucleo/` como funciones
  puras sin DOM ni red, y toda migración se valida contra la suite de `tests/`.

### L-06 · El núcleo se extrae sin pérdida — está verificado, no supuesto
- **Causa:** se reimplementó la geodesia y se comparó contra los 25 vanos que el HTML ya tenía
  calculados: desviación máxima **4,5e−6 m** en distancia y **3,6e−9°** en azimut. La geodesia también
  reproduce las constantes WGS84 publicadas al milímetro (1° de latitud en el ecuador = 110 574,389 m;
  cuarto de meridiano = 10 001 965,7 m). La resistencia del Darien AAAC queda a **1,3 %** de la tabla
  del fabricante.
- **Regla:** cualquier cambio en `nucleo/` que rompa `npm test` es una regresión, no una mejora.
  La prueba de no regresión contra la línea real usa un fixture que vive en la **bóveda privada**
  (son coordenadas de infraestructura de cliente) y se salta sola en CI, avisando.

### L-07 · Los datos de cliente no entran en git, ni en repo privado
- **Causa:** la historia de git es permanente y se propaga a cada clon. Sacar después un archivo que
  no debió entrar obliga a reescribir la historia del repositorio y a que **todas** las copias
  existentes se vuelvan a clonar. Es una operación cara y ruidosa que se evita no cometiendo el error.
  Este repositorio es **público**: el código está a la vista y el dato del cliente no vive aquí.
- **Regla:** coordenadas GPS reales, fotos de campo, informes de cliente y el HTML original **nunca**
  se commitean. Van a `../brain-private/` o a almacenamiento privado. El `.gitignore` los bloquea por
  patrón, pero el `.gitignore` es la segunda línea: la primera es no ponerlos ahí.

---

### L-10 · El módulo de campo NO es 100 % offline: el mapa se cae sin señal
- **Síntoma:** el HTML no tiene ni una dependencia remota de **código** (Leaflet va embebido, cero
  `<script src>` externos), y de ahí se concluyó —y se afirmó— que funcionaba entero sin conexión.
- **Causa:** el código de **código** es offline, pero los **datos del mapa** no. Verificado leyendo
  el archivo:
  ```js
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', …)
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/…')
  ```
  En el vano 14, sin señal, el mapa es un lienzo gris. Lo que sí funciona offline son los datos, el
  cálculo y el esquema geométrico — el propio HTML lo dice en ese título: *"funciona sin conexión"*,
  aplicado al esquema, **no** al mapa. Y como agravante, la política de uso de
  `tile.openstreetmap.org` **prohíbe textualmente el uso offline** y la descarga anticipada.
- **Regla:** *"no tiene dependencias externas"* se comprueba buscando **URLs en tiempo de ejecución**,
  no solo etiquetas `<script src>` y `<link href>`. Y por eso Protomaps/PMTiles no es un lujo del
  sistema nuevo: **tapa un agujero que ya existe hoy en campo**.

### L-11 · La caché persistente de Firestore convierte un problema de caché en un fallo de datos
- **Síntoma:** la página, ya conectada a la base, muestra *"No se pudo cargar — Database is
  closing/hidden"*. No es un fallo de permisos ni de red: los datos están y son legibles.
- **Causa:** se activó `persistentLocalCache` sobre IndexedDB. Basta con una segunda pestaña abierta,
  o con que el navegador cierre la base por su cuenta, para que la lectura entera falle. Un
  contratiempo de **caché** —que por definición es prescindible— tumbó el acceso al **dato**, que sí
  importa y que estaba disponible en el servidor todo el tiempo.
- **Regla:** en este proyecto la caché de Firestore va **en memoria**. Y no se pierde nada: el trabajo
  sin señal en campo **no depende** de esa caché — depende de nuestra propia cola con revisión base y
  cuarentena (`99 §ADR-002`), precisamente porque el último-que-escribe-gana de Firestore es
  inaceptable cuando dos cuadrillas editan el mismo apoyo tras 14 días sin señal.
- **Regla general que deja:** una capa opcional nunca puede tener poder de veto sobre una capa
  esencial. Si una optimización puede impedir leer, no es una optimización: es un punto de fallo.

### L-11b · El mismo error volvió: Firebase Auth TAMBIÉN guarda en IndexedDB
- **Síntoma:** tras quitar la caché persistente de Firestore, reapareció exactamente
  *"Database is closing/hidden"*.
- **Causa:** se arregló el síntoma en un sitio y el culpable estaba en otro. **Firebase Auth guarda
  la sesión en IndexedDB por defecto**, no solo Firestore. Al quitar una de las dos, la otra seguía
  ahí — y el mensaje de error es idéntico, así que parecía que el arreglo no había funcionado.
- **Regla:** la autenticación se inicializa con `initializeAuth(app, { persistence: [...] })` usando
  **`browserLocalPersistence` primero** (que es `localStorage`: síncrono, y no se cierra solo), con
  sesión y memoria como reserva. Tras el cambio, la única IndexedDB que queda es la de telemetría
  interna de Firebase.
- **Lección de método, que vale más que la técnica:** cuando un error reaparece idéntico después de
  un arreglo, la hipótesis por defecto no es *"el arreglo no sirvió"* — es **"hay una segunda fuente
  del mismo síntoma"**. Buscar todas las fuentes antes de dar por bueno el diagnóstico.

### L-11c · El HTML no se cachea, o el usuario ve arreglos que ya no existen
- **Síntoma:** se despliega la corrección y el usuario sigue viendo el fallo viejo.
- **Causa:** el navegador conserva el `index.html`, que es el que decide **qué paquete de JavaScript
  cargar**. Con el HTML viejo en caché, se sigue pidiendo el JavaScript viejo aunque el nuevo ya esté
  publicado. Esto **enmascara diagnósticos**: parece que el arreglo falló cuando ni siquiera se
  ejecutó.
- **Regla:** `web/public/_headers` fija `no-cache` para el HTML y caché eterna para `/assets/*`, que
  llevan huella en el nombre. Y al pedirle a alguien que verifique un arreglo, decirle siempre que
  recargue forzado.

### L-13 · `initializeAuth` no trae el resolvedor de ventanas, y el error no lo dice
- **Síntoma:** al pulsar *Entrar con Google* salta `auth/argument-error`. El mensaje no menciona en
  ningún momento qué argumento sobra o falta.
- **Causa:** `getAuth()` incluye de serie el resolvedor de ventanas emergentes; **`initializeAuth()`
  no**. En cuanto se pasa a la forma explícita —que es lo que hay que hacer para elegir dónde se
  guarda la sesión (`L-11b`)— hay que declarar también `popupRedirectResolver`, o `signInWithPopup`
  falla antes de abrir nada.
- **Regla:** si se usa `initializeAuth`, se pasan **las dos** cosas: la persistencia y el resolvedor.
  Un arreglo que introduce otro fallo no está terminado.

### L-14 · La ventana emergente no es un camino fiable: siempre hay que tener redirección
- **Síntoma:** `auth/popup-blocked`. Apareció al probar el ingreso de forma automatizada, pero le
  puede pasar a cualquiera: los bloqueadores de ventanas emergentes son comunes y en varios
  navegadores de móvil la ventana sencillamente no funciona.
- **Regla:** el ingreso intenta la ventana emergente y, ante `popup-blocked`,
  `operation-not-supported-in-this-environment` o `web-storage-unsupported`, **cae a redirección**:
  la propia página va a Google y vuelve, y no hay ventana que bloquear. Al arrancar se recoge el
  resultado de esa vuelta **antes** de preguntar por la sesión.
- **Por qué importa aquí:** sin esa salida, una cuadrilla con el navegador restrictivo se queda fuera
  del sistema sin entender por qué, y en campo nadie va a diagnosticar un bloqueador de ventanas.

### L-12 · Dos trampas de Firebase Auth que rompen el ingreso sin avisar
- **(a) Dominio no autorizado.** Firebase solo trae de fábrica `localhost` y sus propios dominios
  `*.firebaseapp.com` y `*.web.app`. Sirviendo desde Cloudflare Pages, el botón de entrar **funciona
  en local y falla en producción** hasta que se añade el dominio a la lista de autorizados.
- **(b) El rol no viaja hasta el siguiente ingreso.** Los roles viven en el token, así que asignarlos
  a alguien que ya inició sesión **no surte efecto** hasta que cierra y vuelve a entrar. Se evita
  **pre-creando el usuario con sus roles antes** del primer ingreso: al entrar con Google, la cuenta
  se enlaza por correo y el token nace ya con el rol.
- **Regla:** ambas se comprueban **antes** de decirle al usuario que entre, no después de que falle.

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
- **Causa:** `document.visibilityState === 'hidden'` y `requestAnimationFrame` **no dispara jamás**
  en una pestaña de fondo. MapLibre pinta con ese reloj, y su evento `load` solo dispara tras el
  primer fotograma. Engaña dos veces: (1) al que prueba por herramientas en una pestaña oculta, que
  ve "roto" lo que funciona; (2) al usuario real, si hay un vigilante de tiempo que condena al
  respaldo a quien abre la página en una pestaña de fondo y cambia a ella después.
- **Regla:** todo vigilante de carga del mapa cuenta **solo tiempo visible** (acumula entre
  `visibilitychange`). Y al verificar por herramientas: si nada pinta pero nada da error, comprobar
  `visibilityState` y la latencia de `requestAnimationFrame` ANTES de diagnosticar el código.

---

## Proceso

### L-08 · Al comité se le da el problema crudo, no la conclusión ya pulida
- **Causa:** si el comité recibe una propuesta terminada, la confirma en vez de refutarla (sesgo de
  confirmación). Es el refinamiento R1 de `docs/15-CONSEJO-EXTERNO.md` del proyecto hermano.
- **Regla:** la primera ronda recibe el **dossier crudo** con las opciones descartadas y las
  invariantes; solo las rondas siguientes critican la propuesta. Lo mismo aplica al consejo externo.

### L-09 · Los hechos que deciden la arquitectura se verifican con fuente, no de memoria
- **Síntoma:** citar límites de plan gratuito de memoria y construir encima una decisión cara.
- **Causa:** los planes cambian —Firebase movió Storage a Blaze en octubre de 2024— y el conocimiento
  de un modelo tiene fecha de corte. Un número inventado aquí se paga en rediseño.
- **Regla:** antes de que el comité delibere, una fase de **verificación de hechos con fuente y nivel
  de confianza declarado**. Lo que no se pueda confirmar se marca como no confirmado, no se rellena.

### L-17 · El clasificador de esta sesión bloquea usar la llave admin de Firebase — planear la verificación con sesión de otra forma
- **Síntoma:** `node token-prueba.mjs` con `GOOGLE_APPLICATION_CREDENTIALS` apuntando a la llave
  admin fue denegado por el clasificador de permisos de Claude Code (con y sin sandbox), igual que
  en su día leer credenciales del llavero.
- **Causa:** la política de la herramienta trata el uso de credenciales maestras como acción
  sensible; no es un fallo del proyecto ni de la llave.
- **Regla:** el patrón "usuario de prueba con token custom" (`docs/10 §4`) requiere que lo corra el
  Ingeniero, o una regla de permiso explícita en `.claude/settings.json`. Mientras tanto, la
  verificación con sesión se cubre así: pruebas golden en Node (sin navegador) + smoke de los
  módulos en el navegador con datos SINTÉTICOS + revisión visual del estado sin sesión. No insistir
  con variantes del mismo comando: el bloqueo es intencional.
