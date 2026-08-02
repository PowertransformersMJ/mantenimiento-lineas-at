# 🧪 30 — LECCIONES (Memoria Procedimental)

> Nodo de experiencia. NO se auto-carga: se consulta **antes** de una operación riesgosa o repetitiva
> (trigger 🧪 de `CLAUDE.md §G.2`). Cada lección es un gotcha que ya se pagó una vez.
> Formato: `L-NN · título` → **Síntoma** / **Causa** / **Regla**.

---

## Plataforma y proveedores

### L-01 · GitHub Pages no puede servir este proyecto
- **Causa (verificado contra la documentación oficial, 2026-07-29):** con cuenta Free el repo tendría
  que ser público; aun pagando Pro el SITIO sigue siendo público (restringirlo exige Enterprise
  Cloud); y sus términos **prohíben el uso comercial** en cualquier plan.
- **Regla:** GitHub sirve el código y el CI, **nunca la aplicación**. Detalle y citas → `99 §ADR-001`.

### L-02 · "Gratis" y "sin tarjeta" no son lo mismo
- **Causa:** en Firebase, Storage y Functions marcan literalmente *Not applicable* en el plan Spark y
  exigen Blaze con método de pago (dentro de Blaze sí hay cuota sin costo). El proyecto hermano ya
  tiene Blaze activo desde el 2026-07-23, con alerta en 5 USD/mes.
- **Regla:** la restricción real no es *"sin tarjeta"* sino **"sin factura sorpresa"**. Se evalúa por
  cuota gratuita y curva de coste, y toda opción adoptada lleva alerta de presupuesto ANTES de recibir
  tráfico. Ver también `L-25` (un alta «gratuita» puede pedir tarjeta igualmente).

### L-03 · MapTiler gratis prohíbe el uso comercial; Protomaps no
- **Causa:** el plan Free de MapTiler se limita a *"non-commercial use and research & development"* y
  **prohíbe el caché de servidor** — que es justo lo que exige el mapa offline. Las teselas públicas
  de OpenStreetMap tampoco son para producción, y su política prohíbe el uso offline (`L-10`).
- **Regla:** el mapa va con **Protomaps / PMTiles**: un archivo por HTTP Range, licencia BSD, datos
  ODbL con atribución, sin cuota y **offline por diseño**. Es lo único que cumple a la vez "legal para
  una empresa" y "sirve sin señal".

### L-04 · A esta escala, el coste de almacenamiento NO es el criterio de decisión
- **Causa:** con la medida real (LN-627: 99 fotos, 17,97 MB), **400 líneas × 2 veces al año × 5 años**
  son 70 GB ≈ **1,35 USD/mes**; el tráfico de salida se queda muy por debajo de la cuota gratuita.
- **Regla:** el stack no se elige por el precio del gigabyte —será calderilla durante años— sino por
  **capacidad offline** y **mantenibilidad**. A quien diga "es más barato", pedirle el número: casi
  siempre está optimizando lo que no duele.

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
- **Causa:** la geodesia reimplementada se comparó contra los 25 vanos que el HTML ya traía
  calculados y contra las constantes WGS84 publicadas. **La tabla completa de qué está verificado y
  qué no vive en `40 §8`, que es su dueño**; aquí solo la consecuencia.
- **Regla:** cualquier cambio en `nucleo/` que ponga `npm test` en rojo es una regresión, no una
  mejora. La prueba de no regresión contra la línea real usa un fixture de la **bóveda privada** (son
  coordenadas de cliente) y se salta sola en CI, avisando.

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
  el archivo: dos `L.tileLayer` remotos (`tile.openstreetmap.org` y `server.arcgisonline.com`).
  En el vano 14, sin señal, el mapa es un lienzo gris. Lo que sí funciona offline son los datos, el
  cálculo y el esquema geométrico — el propio HTML lo dice en ese título: *"funciona sin conexión"*,
  aplicado al esquema, **no** al mapa. Y como agravante, la política de uso de
  `tile.openstreetmap.org` **prohíbe textualmente el uso offline** y la descarga anticipada.
- **Regla:** *"no tiene dependencias externas"* se comprueba buscando **URLs en tiempo de ejecución**,
  no solo etiquetas `<script src>` y `<link href>`. Y por eso Protomaps/PMTiles no es un lujo del
  sistema nuevo: **tapa un agujero que ya existe hoy en campo**.

### L-11 · IndexedDB: una capa opcional tumbó el acceso al dato, y lo hizo DOS veces
- **Síntoma:** la página, ya conectada a la base, muestra *"No se pudo cargar — Database is
  closing/hidden"*. No es permisos ni red: los datos están y son legibles. Y **reapareció idéntico**
  después del primer arreglo.
- **Causa, en dos sitios distintos:** (a) `persistentLocalCache` de Firestore sobre IndexedDB —
  basta una segunda pestaña, o que el navegador cierre la base, para que la lectura entera falle;
  (b) **Firebase Auth guarda la sesión en IndexedDB por defecto**, así que quitar solo (a) dejaba
  viva la otra fuente del MISMO mensaje.
- **Regla técnica:** la caché de Firestore va **en memoria**, y la autenticación se inicializa con
  `initializeAuth(app, { persistence: [browserLocalPersistence, ...] })` — `localStorage` es
  síncrono y no se cierra solo. No se pierde nada: el trabajo sin señal NO depende de esa caché,
  depende de nuestra cola con revisión base y cuarentena (`99 §ADR-002`).
- **Regla general, que vale más que la técnica:** una capa OPCIONAL nunca puede tener poder de veto
  sobre una ESENCIAL. Si una optimización puede impedir leer, no es una optimización: es un punto
  de fallo. Y cuando un error reaparece idéntico tras un arreglo, la hipótesis por defecto no es
  *«el arreglo no sirvió»* sino **«hay una segunda fuente del mismo síntoma»**.

### L-13 · El ingreso explícito exige TRES piezas, y ninguna avisa de que falta
> Funde la antigua lección de la ventana emergente: eran causa y consecuencia, no dos gotchas.
- **Síntoma:** al pulsar *Entrar con Google*, `auth/argument-error` — que no dice qué argumento
  falta. Y después, `auth/popup-blocked` al probarlo de forma automatizada.
- **Causa:** `getAuth()` trae de serie el resolvedor de ventanas emergentes; **`initializeAuth()`
  no**. En cuanto se pasa a la forma explícita —obligatorio para elegir dónde se guarda la sesión
  (`L-11`)— hay que declarar TAMBIÉN `popupRedirectResolver`. Y aun con él, la ventana emergente no
  es un camino fiable: los bloqueadores son comunes y en varios navegadores de móvil sencillamente
  no funciona.
- **Regla:** con `initializeAuth` van las tres cosas juntas — persistencia, `popupRedirectResolver`,
  y **caída a REDIRECCIÓN** ante `popup-blocked`, `operation-not-supported-in-this-environment` o
  `web-storage-unsupported`. Al arrancar se recoge el resultado de la vuelta ANTES de preguntar por
  la sesión. Un arreglo que introduce otro fallo no está terminado.
- **Por qué importa aquí:** sin la redirección, una cuadrilla con el navegador restrictivo se queda
  fuera del sistema sin entender por qué — y en campo nadie va a diagnosticar un bloqueador de
  ventanas emergentes.

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
- **Causa:** con `visibilityState === 'hidden'`, `requestAnimationFrame` **no dispara jamás**.
  MapLibre pinta con ese reloj y su evento `load` solo llega tras el primer fotograma. Engaña al que
  prueba por herramientas (ve «roto» lo que funciona) y al usuario real, si un vigilante de tiempo
  condena al respaldo a quien abre la página en una pestaña de fondo.
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

### L-18 · "Deployment complete" NO significa que el dominio raíz ya sirva lo nuevo
- **Síntoma:** `npm run deploy` imprime *"✨ Deployment complete"* con una URL por hash, el
  despliegue aparece como **Production/main** en `wrangler pages deployment list`, esa URL por hash
  ya sirve el paquete nuevo… y `https://mantenimiento-lineas-at.pages.dev` sigue entregando el
  bundle ANTERIOR durante un rato. El Ingeniero recarga, no ve nada nuevo, y concluye —con razón—
  que no se hizo el trabajo.
- **Causa:** el alias del dominio raíz propaga por el borde de Cloudflare con retraso propio, aunque
  el HTML se sirva con `cache-control: no-cache, must-revalidate`.
- **Regla:** *no declarar un despliegue como vivo por lo que imprime el comando.* Verificar así, y
  citar la evidencia: `ls web/dist/assets/ | grep index-` (hash local) contra
  `curl -s https://…pages.dev/ | grep -o 'assets/index-[^"]*\.js'` (hash servido). Si difieren,
  esperar con `until curl … | grep -q '<hash>'; do sleep 5; done` ANTES de decirle nada al
  Ingeniero. Es la aplicación literal de §3.2 (*verifica, no asumas*) al despliegue.
- **Segundo punto ciego (2026-08-01): que `curl` vea el hash nuevo NO significa que el NAVEGADOR lo
  vea.** Chrome sirvió el `index.html` de su caché tres veces seguidas —incluso navegando con
  `?recarga=N`, que cambia la URL pero no lo que ya tiene guardado—, así que la pantalla verificada
  era la ANTERIOR y dos defectos reales pasaron por buenos. `curl` prueba el borde; el navegador es
  otra caché. **Preguntarle a la pestaña qué cargó**, y recargar en duro si no coincide:
  `[...document.querySelectorAll('script[src]')].map(s => s.src)` · `cmd+shift+r`.
- **Por qué el HTML es el que manda (antes `L-11c`):** el `index.html` decide QUÉ paquete de
  JavaScript se pide, y lleva huella en el nombre. Con el HTML viejo en caché se sigue pidiendo el
  JavaScript viejo aunque el nuevo esté publicado — y eso **enmascara diagnósticos**: parece que el
  arreglo falló cuando ni siquiera se ejecutó. `web/public/_headers` fija `no-cache` para el HTML y
  caché eterna para `/assets/*`. Al pedirle a alguien que verifique un arreglo, decirle SIEMPRE que
  recargue forzado.

### L-19 · Una regex que decide una regla de dominio es una bomba de tiempo (y se disfrazó de lista)
- **Síntoma:** `nucleo/mecanica.js` decidía qué apoyo corta un tramo de tensión con
  `/retenci|terminal|ángulo|angulo|derivaci/i` — y la constante se llamaba `FUNCIONES_ANCLA`,
  **el mismo nombre** que la lista cerrada del contrato. Dos cosas distintas con el mismo nombre.
- **Por qué importa:** el corte de tramo gobierna TODO el cálculo mecánico. La regex aceptaba
  cualquier texto que contuviera la sílaba (`'poste terminal viejo'`), y tres pruebas de oro usaban
  `'Retención'` a secas — que **no es un valor del contrato** (`'Retención / anclaje'`). Pasaban por
  casualidad, no por corrección.
- **Regla:** las reglas de dominio se expresan como **listas cerradas**, nunca como coincidencia de
  texto. Y cuando la misma lista debe existir en dos sitios porque `nucleo/` no puede importar nada,
  la coincidencia **la vigila una prueba** que lee el otro archivo y compara — no la memoria.
- **Cómo se cazó:** el Ingeniero desconfió del reporte y pidió verificación adversarial. Un
  escéptico encontró la regex viva en el paquete PUBLICADO. *Reportar "hecho" sin verificar contra
  producción es cómo se cuela esto.*

### L-20 · La pantalla no puede prometer lo que el archivo no cumple
- **Síntoma:** la pestaña Exportar afirmaba *"Todos llevan su procedencia adentro: versión del
  exportador, hipótesis, sistema de referencia y precisión del GPS"*. Era falso para uno de los
  cuatro: el CSV **de datos crudos** no la lleva, porque una cabecera de comentarios rompe el
  RFC 4180 que esperan pandas y QGIS — omisión correcta, pero la frase decía lo contrario.
- **Por qué importa más que un texto:** es exactamente el tipo de afirmación que un cliente
  comprueba abriendo el archivo. Una promesa incumplida en la interfaz destruye la confianza en
  TODAS las demás cifras, incluidas las que sí son correctas.
- **Regla:** cuando una decisión de diseño crea una excepción, **la excepción se dice en la misma
  frase**, con su motivo, y se **fija con una prueba** que falle si alguien la "arregla" sin
  pensarlo. Aquí: el crudo declara su procedencia columna por columna (`Precision_m`, `Metodo`,
  `Sistema_referencia`) y su fecha en el nombre del archivo; eso es lo que dice ahora la pantalla.
- **Cómo se cazó:** un escéptico GENERÓ los cuatro archivos de verdad con node y los leyó, en vez
  de leer el código. *Verificar un entregable es producirlo y abrirlo, no releer la función.*

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

### L-22 · Desplegar el código sin desplegar las reglas de Firestore: el dato existe y no llega
- **Síntoma:** la colección `investigaciones` sembrada correctamente en Firestore, el código nuevo
  en producción… y la web sin el evento. En la consola: *«Missing or insufficient permissions»*.
- **Causa:** `firestore.rules` termina con `match /{document=**} { allow read, write: if false; }`.
  Toda colección no declarada queda cerrada — **es el diseño funcionando**, no un fallo.
- **Regla:** una colección nueva son **TRES** despliegues, no uno: (1) el código, (2) `firebase
  deploy --only firestore:rules`, (3) la siembra del dato. Si falta el (2), el síntoma no dice
  «faltan reglas»: dice «no hay datos», que es lo que hace perder la tarde.
- **Lo que salvó la vista:** la lectura de expedientes va en su propio `try/catch` y devuelve lista
  vacía. Entre el despliegue del código y el de las reglas, la línea **siguió viéndose completa**.
  *Una capa opcional jamás puede tener poder de veto sobre una esencial* (misma regla que `L-11`).

### L-23 · Una coordenada real dentro de una PRUEBA es una fuga igual que en el código
- **Síntoma:** `tests/exportar.test.js` afirmaba `filas[1].includes('10.35••••')` — la latitud real
  de una estructura de la LN-627, escrita en un repositorio **público**. Pasó mi propia auditoría
  de fugas dos veces porque yo buscaba en `web/src` y en el paquete publicado, no en `tests/`.
- **Recaída, 2026-08-01:** al corregir el código la coordenada se copió **a esta misma lección** y
  sobrevivió porque `docs/` no se grepeaba de verdad. Si un dato no hace falta para explicar, no se
  escribe: el ejemplo se entiende igual enmascarado.
- **Por qué se cuela:** al escribir una prueba de formato uno copia el valor observado de la
  salida real para que la aserción sea concreta. Es el gesto natural, y es justo el que filtra.
- **Regla:** en las pruebas, el valor esperado se **DERIVA del fixture de la bóveda**
  (`crudo[0].lat.toFixed(6)`), nunca se escribe literal. Y la auditoría previa al commit incluye
  `tests/`, `herramientas/` y `docs/`, no solo el código de la aplicación:
  `grep -rnE '\b10\.3[45][0-9]{4}\b|\b-?75\.4[89][0-9]{4}\b' --include='*.js' --include='*.ts' .`
- **Alcance:** la historia de git es permanente (`L-07`), así que el valor sigue en los commits
  antiguos. Se corrigió hacia adelante; si algún día importa de verdad, exige reescribir historia.

### L-24 · Un agente que muere deja código SIN VALIDAR, no código roto
- **Síntoma:** 4 de 6 constructores cayeron con *«API Error: Connection closed mid-response»*. Sus
  módulos estaban escritos y la suite pasaba **418/418 en verde** — porque las pruebas que faltaban
  eran justo las de esos módulos. Verde total, cobertura cero en lo nuevo.
- **Por qué engaña:** el número de pruebas que pasan sube igual (los otros agentes sí las
  escribieron), así que el tablero dice «todo bien» mientras dos módulos entran a producción sin
  que nadie los haya ejercitado.
- **Regla:** cuando un agente muere, **inventariar sus archivos entregables uno a uno** —
  especialmente `tests/` — y escribir a mano lo que falte ANTES de integrar. Un `npm test` verde no
  prueba que exista prueba: prueba que las que existen pasan.
- **Resultado aquí:** las dos suites escritas a mano (15 + 12 pruebas) encontraron que ambos
  módulos eran correctos. La única corrección fue de MI prueba, que buscaba el escapado en un campo
  que el informe no imprime. *Escribir la prueba después también sirve para descubrir qué hace de
  verdad el módulo.*

### L-25 · Un alta «gratuita» puede esconder un formulario de pago — y ahí Claude se detiene
- **Síntoma:** el Ingeniero autorizó pulsar «Add R2 subscription to my account» (0,00 USD, 10 GB
  gratis). El botón no cobraba nada… pero abría un **checkout con campos de tarjeta y dirección de
  facturación**, más una casilla de *«autorizo a Cloudflare a cobrar a esta tarjeta el consumo que
  exceda los límites»*.
- **Regla:** Claude puede pulsar un botón que el dueño autorizó explícitamente **tras enseñarle el
  texto legal exacto**, pero **NUNCA escribe datos de tarjeta ni dirección de facturación**, con
  autorización o sin ella. Se para, deja el formulario abierto en la pestaña del dueño y le dice
  exactamente qué falta.
- **Cómo se hace bien:** (1) abrir la página y LEERLA antes de tocar nada; (2) citar el texto legal
  literal (renovación automática, cargo al medio de pago, términos); (3) señalar el choque con las
  reglas del propio proyecto —aquí, *«se prefiere el servicio que APAGA al que COBRA»*, y R2 cobra;
  (4) pedir confirmación explícita para ESE clic; (5) detenerse en el primer campo de pago.
- **Lección general:** «gratis» describe el precio, no el flujo. Antes de prometer que un alta es
  inocua, hay que ver el formulario — el importe puede ser 0,00 y aun así exigir tarjeta.

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

### L-28 · Un módulo construido y probado que ninguna pantalla llama es INVISIBLE
- **Síntoma, dos veces en dos semanas:** `nucleo/cargas.js` (carga transversal, con sus pruebas de
  oro) y `web/src/componentes/FichaCriterios.tsx` (el semáforo por apoyo, con su capa pura y sus
  pruebas) estaban terminados y **no los llamaba nadie**. Grep en todo el repositorio:
  `FichaCriterios` solo se referenciaba a sí mismo.
- **Por qué se cuela:** `npm test` sale verde —las pruebas del módulo pasan— y el inventario de
  tareas lo da por hecho. El módulo *existe*; lo que no existe es su camino hasta el usuario. Es el
  primo hermano de `L-24`: allí el agente muere y el código queda sin validar; aquí el código está
  validado y queda sin conectar.
- **Regla:** una tarea de construcción no está cerrada hasta que **algo que el usuario ve** lo
  llama. Antes de marcar hecho: `grep -rn "<nombreDelModulo>" web/src exportar nucleo` y comprobar
  que aparece **fuera de sí mismo y de sus pruebas**. Si el único importador es su test, está
  muerto.
- **Barrido preventivo:** el gate `anti-codigo-muerto` cubre exportaciones sin uso dentro de un
  archivo, no módulos enteros huérfanos. Merece una comprobación propia en CI.

### L-29 · Para afirmar que algo va en los DOS sentidos, mira el MENOR, no el mayor
- **Síntoma:** la pestaña Cargas anunciaba «5 apoyos tiran hacia LOS DOS lados» y en tres de ellos
  el sentido secundario valía −15, −27 y +28 kgf contra un ruido de tendido de obra de 85 kgf.
  Indistinguible de que la cuadrilla tensara un tramo un pelo distinto.
- **Causa:** la bandera se calculaba comparando el ruido contra el MAYOR de los dos sentidos. Pero
  la afirmación no era «hay carga»: era «hay carga **en ambos**», y esa la sostiene el menor.
- **Regla, general y barata de aplicar:** cuando una conclusión necesita que **varias** cantidades
  superen un umbral, la comprobación va sobre el **mínimo**, nunca sobre el máximo ni sobre la
  suma. Y conviene separar las dos preguntas en dos banderas con nombre distinto
  (`sentidoResoluble` / `inversionResoluble`) en vez de reutilizar una: reutilizarla es justo lo
  que hizo que el error no se viera.
