# 🧪 31 — LECCIONES · PROVEEDORES (Memoria Procedimental)

> Nodo HIJO de `docs/30-LECCIONES.md`: mismos `L-NN`, sin renumerar. Aquí vive lo que depende de un
> TERCERO — su factura, su licencia o su SDK (GitHub, Firebase, Cloudflare, MapTiler/OpenStreetMap, R2).
> Se consulta **ANTES de contratar o elegir** (*¿esto cuesta dinero? ¿lo puedo usar legalmente en un
> trabajo que se factura? ¿de verdad es más barato?*) y **DESPUÉS, cuando el error viene con el
> apellido del proveedor** (`auth/argument-error`, `auth/popup-blocked`, entra en local y falla en
> producción, *«Database is closing/hidden»*, *«Missing or insufficient permissions»* con el dato ya
> sembrado). Formato: `L-NN · título` → **Síntoma** / **Causa** / **Regla**.

---

## Lo que se firma y lo que se paga

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

### L-54 · Cuando ningún proveedor deja usar su capa, el camino no es renunciar: es procesar el dato abierto

- **Síntoma:** el botón «Satelital» llevaba dos meses apagado con el rótulo «licencia por verificar».
  Verificar dio lo esperado y peor: **Esri** exige cuenta y prohíbe el uso comercial · **EOX
  Sentinel-2 cloudless** es CC BY-**NC**-SA desde 2018 y su uso comercial se compra · **Open-Meteo**
  dice con esas palabras que su vía gratuita es solo para fines **no** comerciales. Tres puertas
  cerradas para una herramienta de trabajo de un empleador.
- **Causa:** se estaba buscando un SERVICIO de teselas —alguien que sirva la imagen— y ahí el
  producto es el servicio, con su cuota y su contrato. El DATO de debajo es otra cosa: Copernicus
  (Sentinel) es «free, full and open» con uso comercial permitido, y Landsat (USGS) es dominio
  público. Ambos con copias públicas y **anónimas** (AWS Open Data, Planetary Computer): sin cuenta,
  sin clave y sin tarjeta.
- **Regla:** ante una capa que hace falta, se pregunta por el **dato**, no por el proveedor. Si el
  dato es abierto, procesarlo una vez y autohospedarlo cuesta un rato y elimina de golpe la cuota, el
  contrato, la dependencia de red y la caducidad de la licencia. Aquí salieron dos capas de 3,5 y
  2,2 MiB que viajan con el sitio.
- **Y el otro lado de la moneda, que es de dominio y no de licencia:** el dato abierto que se
  consigue puede NO ser el que se pidió. «Un mapa de temperatura» solo existe con el satélite
  TÉRMICO, y eso es la temperatura del **SUELO**, no la del aire. La del aire, a la escala de una
  línea de 3 km, es UN píxel de cualquier modelo meteorológico. Se entrega lo que hay, diciendo
  exactamente lo que es — el detalle en `99 §ADR-034`.

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

### L-25 · Un alta «gratuita» puede esconder un formulario de pago, y ahí Claude se detiene
- **Hecho:** el alta de R2 costaba 0,00 USD/mes y aun así exigía **tarjeta y dirección de
  facturación** antes de activar nada. «Gratis» describe el precio, no el flujo.
- **Regla, y es un límite duro, no una preferencia:** Claude NO rellena datos de pago, ni con
  autorización explícita, ni si se los dictan. Lo que sí hace: llegar al formulario y parar; leer y
  resumir lo que se firma (importe, renovación, qué se cobra al pasarse); contrastarlo con la regla
  del proyecto (*se prefiere el servicio que APAGA al que COBRA*, y R2 **cobra**); dar el enlace
  directo diciendo qué escribir; y proponer la alerta de presupuesto al terminar. Ver `L-02`.


---

## Cuando el proveedor no deja entrar ni leer

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
- ⚠️ **Volvió a pasar el 04-08-2026** con la colección `analisis`, y se escribió otra lección sin ver
  ésta. La recaída está anotada en `32 · L-36`, y la regla para no repetirla en `30 · L-39`.

### L-37 · Un portal de datos abierto miente de tres formas distintas, y ninguna da error
Verificado el 2026-08-04 contra `datos.gov.co` (IDEAM), integrando el clima del segmento RCA.

- **Trampa 1 · la consulta que se cuelga, no que falla.** Filtrar la serie de observaciones por
  coordenada parece lo natural: son 20 millones de lecturas y el filtro geográfico **no responde**
  (90 s sin contestar, comprobado). No devuelve error ni lista vacía: se queda colgada, que es el
  peor de los tres resultados porque parece red lenta. **Regla:** se consulta el CATÁLOGO de
  estaciones (`hp9r-jxuu`, contesta en menos de un segundo) y solo después la serie, ya filtrada por
  código de estación.
- **Trampa 2 · la estación más cercana puede no medir lo que buscas.** El catálogo mezcla redes:
  junto a las climatológicas hay **limnimétricas y limnigráficas, que miden el nivel de un río**, y
  mareográficas. Cerca del evento de LN-627, **tres de las cinco más próximas eran limnimétricas**.
  Elegir una habría devuelto cero lecturas de viento, y nadie sabría si es que no hubo viento o que
  esa estación nunca lo midió: **un hueco disfrazado de dato**. **Regla:** filtrar por categoría
  antes de elegir por distancia, y que ese filtro tenga prueba.
- **Trampa 3 · el campo compuesto trae lat/lon INTERCAMBIADAS.** El objeto `ubicaci_n` del catálogo
  pone la longitud en `latitude`. Usarlo manda a buscar estaciones al otro lado del mundo, y como
  devuelve resultados —los hay en cualquier sitio— no se nota. **Regla:** leer SIEMPRE los campos
  sueltos `latitud`/`longitud`, y desconfiar por defecto de todo campo compuesto de un tercero.
- **La regla madre de las tres:** un portal abierto no valida lo que publica. Antes de creerle a
  cualquier fuente nueva se prueban las tres preguntas — ¿responde?, ¿mide lo que digo?, ¿el campo
  significa lo que su nombre dice? — y se escribe la respuesta, con fecha, junto al código.
- **Y lo que el portal NO tiene también es un resultado:** IDEAM no publica descargas atmosféricas en
  abierto. En una línea tropical el rayo es la causa nº 1, así que ese hueco se **declara siempre**;
  una fila vacía se leería como «descartado». Detalle en `nucleo/clima.js` y `99 §ADR-020`.

### L-38 · Cuando la defensa canónica exige plan de pago, se DETECTA en vez de PREVENIR — y se escribe que es un compromiso
- **Síntoma:** «Entrar con Google» era una vía de alta pública: cualquiera con cuenta de Google podía
  crearse una identidad en el proyecto, y el 31-07-2026 ocurrió de verdad.
- **La defensa canónica no se podía comprar.** Impedir el alta de raíz exige una *blocking function*
  (`beforeUserCreated`); verificado con fuente el 2026-08-04: exige Identity Platform y se despliega
  como Cloud Function o Cloud Run — *«to deploy functions, your project must be on the Blaze pricing
  plan»*. **Blaze factura y no apaga**, que es exactamente lo que `ADR-001` descartó.
- **Regla:** cuando la pieza correcta obliga a facturar, no se enciende la factura ni se finge que el
  agujero no existe. Se construye la defensa que sí cabe —aquí: (a) quitar el proveedor que permitía
  el alta, (b) que una cuenta sin reclamos sea inerte, y (c) un comando `auditar` que **detecta** las
  cuentas activas sin `orgId` y sale con código 1— y **se escribe en el ADR que es un compromiso
  consciente**.
- **Por qué lo último es la mitad de la lección:** sin esa frase, el siguiente que lea el código verá
  una defensa a medias, la leerá como descuido y la «arreglará» encendiendo Blaze. Un compromiso sin
  documentar no se distingue de un error, y el que viene detrás lo revierte.
