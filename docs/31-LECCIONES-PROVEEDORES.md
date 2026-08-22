# 🧪 31 — LECCIONES · PROVEEDORES (Memoria Procedimental)

> Nodo HIJO de `docs/30-LECCIONES.md`: mismos `L-NN`, sin renumerar.
> **Qué guarda:** lo que se decide **ANTES** de contratar o elegir a un tercero — *¿esto cuesta
> dinero? ¿lo puedo usar legalmente en un trabajo que se factura? ¿de verdad es más barato?*
> **Lo que falla DESPUÉS** —el SDK que rompe el ingreso, las reglas sin desplegar, el portal que
> miente sin dar error— **se partió el 21-08 a `docs/35-LECCIONES-ACCESO-Y-PORTALES.md`**
> (`99 §ADR-048`). Formato: `L-NN · título` → **Síntoma** / **Causa** / **Regla**.

---

## Lo que se firma y lo que se paga

### L-60 · Un organismo publica VARIAS licencias: la del dato que buscas no es la del dato que sale primero

- **Síntoma:** buscando más resolución para la capa satelital apareció el IGAC, que sirve ortoimágenes
  de 3 m para todo Bolívar y de 10 cm para municipios vecinos — comprobado descargando muestras. La
  primera página de licencia que devuelve una búsqueda es la de **datos abiertos**, y dice **CC BY-SA
  4.0: uso comercial permitido**. Con eso bastaba para construir la capa.
- **Causa:** esa licencia es la de los datos **catastrales y cartográficos vectoriales**. Las
  **imágenes** van por otra: Colombia en Mapas declara que la imagen consultada *«cuenta con licencia
  de uso gubernamental, razón por la cual, no puede ser compartida ni comercializada»*, y añade que
  «cada dato dispuesto en la plataforma tiene su licencia de uso». Este sistema autohospeda y publica
  sus capas: republicar esa imagen **es** compartirla. La primera lectura habría metido en un repo
  PÚBLICO una imagen que su dueño prohíbe redistribuir.
- **Regla:** la licencia se verifica **del producto concreto que se va a usar**, en la página que lo
  sirve, y no del organismo en general. Un «CC BY-SA» encontrado en el portal madre no cubre lo que
  cuelga de otro subportal. Si dos fuentes del mismo dueño se contradicen, manda **la más restrictiva
  y la más cercana al archivo** — y se cita textual en el ADR, como aquí.
- **Y el corolario que ahorra tiempo:** encontrar la fuente perfecta y no poder usarla NO es trabajo
  perdido si queda escrito. El generador ya sabe pedir esas imágenes: el día que haya autorización, la
  capa es una tarde. Sin el ADR, dentro de un año alguien vuelve a descubrir el IGAC desde cero — y
  puede que esa vez no lea la segunda página.

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
