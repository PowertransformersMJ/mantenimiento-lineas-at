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
