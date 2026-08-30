# 🧪 35 — LECCIONES · EL PROVEEDOR QUE NO DEJA ENTRAR NI LEER

> Nodo HIJO de `docs/30-LECCIONES.md` (su madre) y HERMANO de `31`, del que se partió el 2026-08-21
> por tope (`99 §ADR-048`). NO se auto-carga: se consulta **antes** de tocar el ingreso, las reglas
> de la base o un portal de datos ajeno (trigger 🧪 de `CLAUDE.md §G.2`). Los `L-NN` conservan su
> número original — se MOVIERON, no se renumeraron: los cita el código fuente.
> **Qué guarda:** el tercero ya está contratado y aun así el dato no llega — el SDK que rompe el
> ingreso sin avisar, las reglas que no se desplegaron, el portal público que miente sin dar error.
> **Se consulta cuando:** «entra en local y falla en producción» · «no me deja entrar» · «el dato
> existe y la pantalla no lo ve» · «el portal responde 200 y los números no son los que pedí».
> **Hilo común:** aquí nadie devuelve un error. El proveedor contesta que sí y entrega otra cosa —o
> nada—, y el fallo se lee como si fuera de casa. Su hermano `31` guarda lo otro: qué se puede usar
> y qué cuesta, que se decide ANTES de contratar.
> Formato: `L-NN · título` → **Síntoma** / **Causa** / **Regla**.

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
  ésta. La recaída está anotada en `L-36`, aquí mismo, y la regla para no repetirla en `30 · L-39`.

### L-64 · Para una hipótesis INSTANTÁNEA no sirve una serie de MEDIAS HORARIAS
Verificado el 2026-08-21 llamando a cada fuente, no de memoria.

- **La pregunta:** ¿se pueden tomar de IDEAM o NASA POWER los datos de radiación solar para cerrar
  los **1.000 W/m² adoptados** de la ampacidad (`TODO-71`)?
- **Lo que hay, comprobado:**

  | Fuente | Existe | Resolución | Paso |
  |---|---|---|---|
  | **IDEAM** (portal abierto) | ❌ **ninguna serie de radiación**; el catálogo no tiene esa categoría | — | — |
  | **Cardique** (autoridad de Bolívar) | ✅ GHI **medida** + viento, en la zona | estación | **741 filas: solo enero de 2022** |
  | **NASA POWER** horario | ✅ sin clave, 200 en 0,8 s | **1° ≈ 110 km** | 1 h · **83 días de desfase** |
  | **NASA POWER** diario | ✅ mismo servicio | 1° | 1 día · **6 días de desfase** |
  | **Global Solar Atlas** (ya en uso) | ✅ | 250 m mapa · ~1 km TMY | 1 h (año típico) |

- **Y el fallo de fondo, que no es de ninguna de ellas:** el valor adoptado es una irradiancia
  **INSTANTÁNEA** y todo lo disponible son **MEDIAS HORARIAS** (NASA POWER las publica en `Wh/m²`,
  que en paso horario ES la media). Una media horaria está siempre POR DEBAJO del pico instantáneo
  que contiene, y el promediado espacial de una celda de 1° lo rebaja más todavía.
- **De ahí la regla, y el sentido importa:** en ampacidad, **más sol supuesto = conductor más
  caliente = menos amperios**, así que subir el valor va al lado seguro y bajarlo al arriesgado.
  **Bajar los 1.000 apoyándose en medias horarias subiría la ampacidad** sobre una prueba que no dice
  lo que parece. Ese es el error peligroso.
- ⚠️ **CORREGIDO el mismo día, y la corrección importa:** con tres días de muestra el máximo horario
  daba 872 W/m² y se escribió que 1.000 era «el lado conservador». Con **2026 entero** el máximo de
  medias horarias es **999,75 W/m²** — justo encima del valor adoptado. Como el pico INSTANTÁNEO
  dentro de esa hora es por fuerza mayor que su media, **1.000 W/m² no es una cota superior holgada
  de la irradiancia instantánea: es aproximadamente la MEDIA de la hora más soleada del año.** Sirve
  para no bajarlo; **no** sirve para dormir tranquilo. Muestra de tres días → conclusión de un año:
  el otro filo de esta misma lección.
- **Y hay dos desfases, no uno:** el paso HORARIO va 83 días por detrás; el DIARIO, 6. Documentado
  como «near real time» para los dos. Si la pregunta exige intradía del año en curso, los últimos
  ~3 meses **no existen**. Además el endpoint `regional` **no admite horario** (404): la región se
  arma punto a punto, una llamada por celda.
- **Regla general:** antes de buscar la fuente, escribe qué MAGNITUD exige la hipótesis —instantánea
  o promediada, y sobre qué ventana—. Media docena de portales pueden tener «radiación solar» y
  ninguno tener lo que se necesita. Y comprueba el TAMAÑO de la serie antes de celebrarla: la de
  Cardique tenía las variables exactas y un mes de historia.

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

---

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

### L-36 · ⇢ PUNTERO a `L-22`, aquí al lado — y la recaída, que es lo que hay que leer
> **El cuerpo de esta lección NO vive aquí.** El dueño es
> **`35 · L-22` · «Desplegar el código sin desplegar las reglas de Firestore: el dato existe y no
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

### L-75 · «Success! · Production» de Cloudflare Pages NO quiere decir que la web haya cambiado

- **Síntoma (2026-08-26, `§ADR-087`):** `wrangler pages deploy` dijo `✨ Success!`, el listado de
  despliegues puso **`Production · main · 2f0b9e9`**, la URL propia del despliegue servía el paquete
  nuevo… y **`mantenimiento-lineas-at.pages.dev` siguió sirviendo el anterior durante más de media
  hora**, con dos despliegues encima y uno repetido con `--branch=main` explícito.
- **Medido, no supuesto:** los dos HTML se diferencian en **una línea** —el `src` del paquete—; el
  alias servía el de `58a67f01` (una hora antes) y el despliegue nuevo, el suyo. Sin `cf-cache-status`
  y con `cache-control: no-cache`, así que **no es caché de borde: es el ALIAS, que no se movió**.
- **La trampa fina:** comprobar que el archivo nuevo (`/assets/index-XXXX.js`) responde 200 en el
  alias **no prueba nada** — Pages sirve los recursos de todos los despliegues del proyecto, así que
  el paquete viejo también responde 200 en el despliegue nuevo. Lo único que distingue es **qué
  paquete NOMBRA el HTML** que devuelve el alias.
- **Regla:** el despliegue no se da por hecho con la salida de `wrangler`. Se compara el `src` del
  HTML **del alias** contra el de `dist/index.html`, con anti-caché, y **hasta que coincidan la web
  NO ha cambiado** — se diga lo que se diga en la consola. Si no coinciden y no se mueve, es cosa del
  panel de Cloudflare (promover el despliegue a producción), y eso es **mano del Ingeniero**.
- **Hermana de `32 · L-18/L-35`** (verificar contra producción, no contra `dist/`) y de la razón por
  la que existe `TODO-89`: mientras publicar sea a mano, este eslabón se comprueba a mano.
