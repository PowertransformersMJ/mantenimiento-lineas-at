# 📜 99 — HISTORIAL DE DECISIONES (ADR)

> Memoria de largo plazo. **No se auto-carga**: se consulta por el trigger 🟢 vía `docs/00-INDICE.md`.
> Aquí vive el **porqué** de cada decisión cara de revertir. Se APENDA, nunca se reescribe.
> Formato: Contexto · Decisión · Alternativas descartadas · Consecuencias · Crudo de respaldo.

---

## ADR-001 · 2026-07-29 · Arquitectura y stack de la plataforma

**Estado:** ✅ Decidido · ✅ **REVISADO EXTERNAMENTE el 2026-07-29** (Gemini 3.1 Pro vía Antigravity).
El veredicto se **confirma en lo esencial** y se **enmienda en tres puntos** → ver **ADR-002**.

### Contexto

El Ingeniero entrega un módulo de campo de UNA línea: `LN-627_Modulo_Campo_10.html`, 30.089.751
bytes, 2.796 líneas, sin una sola dependencia remota de código. Medido, no supuesto:

- 92 % del archivo (27,7 MB en base64 ≈ 20,8 MB binarios) son **209 objetos de imagen**: 99 fotos de
  trabajo (17,97 MB, **177 KB de media**), 99 miniaturas (1,65 MB, **16 KB**, el 9,2 % del original),
  4 figuras de investigación de falla y 3 recursos de interfaz. Más un **DOCX de 1,49 MB** embebido.
- **14 de 26 apoyos** tienen fotografía; 3,8 fotos por apoyo sobre el total de la línea.
- La línea: **2,929 km · 26 apoyos · 25 vanos** · vano medio 117,2 m (mín. 13,4 — el par de retención
  E20–E21 — máx. 336,7) · **vano ideal de regulación 188,78 m**.
- **115 funciones de cálculo real**: Vincenty sobre WGS84, deflexiones, vano viento y vano peso,
  tramos de tensión entre anclas, VIR, catenaria y parábola, ecuación de cambio de estado resuelta
  por bisección, ampacidad IEEE Std 738 con derrateo térmico, cargas de viento, validaciones de
  coherencia y memoria de cantidades. Más una ficha de ~48 campos por apoyo.

El encargo es pasar de eso a una plataforma que gerencie **muchas** líneas, con histórico entre
inspecciones, para cuadrillas en campo y oficina, sin presupuesto y con datos reales de AFINIA/EPM.

### Método

**Decisión Fuerte** según `CLAUDE.md §G.2` 🛰️ → skill `arquitecto-software` + **Comité de Expertos ×3**
(`comite-expertos`): 29 agentes, 0 fallos, 2,7 M tokens, 59 minutos.

1. **Fase de hechos:** 4 verificadores con WebSearch trajeron los límites reales de plan gratuito de
   Cloudflare, Firebase/GCP, alternativas (Supabase, Neon, Turso, Appwrite, PocketBase) y
   GitHub/mapas — **con fuente, fecha y nivel de confianza declarado**. Nada de memoria (`30 · L-09`).
2. **3 rondas** de 5/3/3 expertos con **peer review cruzado anónimo** y síntesis de presidente:
   exactitud → profundidad → claridad y acción. **Anti-anclaje R1:** la ronda 1 recibió el problema
   CRUDO, sin conclusión previa, para que refutara en vez de confirmar (`30 · L-08`).

### Decisión

**Principio rector:** *durante la jornada, el TELÉFONO es la fuente de verdad; la nube es un buzón que
se vacía cuando hay señal.* De ahí los tres guardarraíles de `CLAUDE.md §1`.

**Reformulación de la restricción de presupuesto — por seguridad, no por finanzas:**

> **"Cero cobro, siempre. Y ninguna pieza con gasto ILIMITADO, nunca."**

La documentación de Firebase dice textualmente que en su plan de pago *"you cannot cap your usage"*,
y que las alertas *"do not cap your usage or charges"*. Un sistema que nadie audita línea por línea no
puede vivir donde un bucle se vuelve factura. **Se prefiere el servicio que APAGA al que COBRA.**
Y una **tarjeta prepago no es un tope de gasto**: sin saldo genera mora y suspensión, con los datos
del cliente dentro. El único tope real es no tener plan de pago activo.

| Capa | Decisión | Número que la respalda |
|---|---|---|
| **Cálculo** | `nucleo/` — funciones puras, sin DOM ni red, con pruebas de oro | 53 pruebas en verde; desviación 4,5·10⁻⁶ m contra el original |
| **Datos** | **SQLite local** (archivo `.sqlite`) → **Cloudflare D1** solo si se dispara F5 | D1: 500 MB/base, 5 M lecturas/día, 100.000 escrituras/día, **no se pausa**, sin tarjeta |
| **Fotos** | **Disco del Ingeniero + segundo disco**, catalogadas por huella → **R2** solo en F6 | R2: 10 GB-mes y **salida de datos $0 sin límite** (único proveedor así) |
| **Frontend** | **Vite + TypeScript**, web instalable, sin framework pesado | El Ingeniero no programa: Claude debe poder leer esto en dos años |
| **Hosting** | **Cloudflare Pages** (desde F5) | Ancho de banda y peticiones a assets *"free and unlimited"*; 500 builds/mes; *"no credit card required"* |
| **Cómputo servidor** | **Ninguno** hasta F5; luego solo ingesta de lotes y enlaces firmados | El límite que mata no son las 100.000 peticiones/día: son los **10 ms de CPU por invocación** |
| **Autenticación** | Campo: **sin login** — llave de dispositivo ligada a equipo y orden de trabajo, caducidad al cierre de campaña. Oficina: contraseña + 2FA para 2-3 personas | Revocar = borrar una fila. Sin derivación de clave, el muro de 10 ms de CPU desaparece |
| **Mapas** | **Protomaps / PMTiles + MapLibre**, recortes por línea | Sin cuota y sin contrato; único deber: atribución a OpenStreetMap |
| **CI/CD** | **GitHub Actions**, runners `ubuntu-latest` **siempre** | macOS quema el cupo ~10× más rápido ($0,062/min vs $0,006/min) |

**Modelo de datos — las tres reglas que no se negocian:**

1. **La identidad de una estructura es un UUID inmutable, no el número "E07".** Renumerar, seccionar
   la línea o corregir una coordenada son **hechos fechados**, jamás sobrescrituras. Sin esto no hay
   tendencia de corrosión, no hay defensa técnica ante el cliente y no se puede reproducir un informe
   emitido en 2026.
2. **Se versiona el DICTAMEN, no solo el dato.** Todo resultado guardado lleva con qué **versión del
   motor** y con qué **hipótesis** se produjo.
3. **Una columna de organización desde el día 1** en todas las tablas. Es lo único que se rescata del
   patrón Firebase de la inmobiliaria: añadirla después es una migración, ponerla hoy es una columna.

### Alternativas descartadas (y por qué)

| Descartada | Motivo verificado |
|---|---|
| **GitHub Pages** | Tres razones independientes: (1) en cuenta Free *"the repository must be public"*; (2) pagando Pro el código se esconde pero **el sitio sigue siendo público**; (3) sus términos **prohíben el uso comercial** — *"not intended for or allowed to be used as a free web-hosting service to run your online business… or providing commercial software as a service"*. |
| **Firebase Storage + Cloud Functions** (el patrón de la inmobiliaria) | *"Not applicable"* en el plan gratuito. El requisito de facturación entró en vigor **de forma total y retroactiva el 03-02-2026**. Y dentro del plan de pago los números tampoco dan: la cuota sin costo son **5.000 subidas/mes** y una campaña de 40 líneas concentra ~8.320 objetos (fotos + miniaturas) — **66 % por encima, el primer mes real**. Además es un **error de categoría**: un CRM inmobiliario es online, liviano en escritura y sin captura sin señal. Esto es lo contrario en las cuatro cosas. |
| **Supabase** | El argumento débil (se pausa a los 7 días) **se retiró**: con el teléfono como fuente de verdad, la pausa no daña. Se descarta por otros cinco motivos, el principal: una restricción de base que **RECHAZA** convierte un problema de calidad de dato en **pérdida de jornada de campo** cuando el lote llega tras 14 días sin señal. Más: 500 MB de base, 1 GB de archivos, y el modo de falla documentado es **error 402 en TODA la API** con la base en solo lectura. |
| **Turso · Appwrite · Neon · PocketBase** | Turso archiva a los 10 días de inactividad. Appwrite se pausa por inactividad **del desarrollador en la consola** y permite **1 solo miembro por organización** — descarta "cuadrillas + oficina" de plano. Neon: 0,5 GB por proyecto. PocketBase: pre-1.0, un mantenedor, su propia documentación desaconseja producción crítica. |
| **MapTiler Free · Stadia Free** | **Uso comercial prohibido por contrato**: un entregable a AFINIA sería incumplimiento desde la primera carga del mapa. Prohíben además el caché de servidor, que es justo lo que hace falta para offline. El primer escalón legal de MapTiler son $30/mes. |
| **`tile.openstreetmap.org`** | Su política de uso **prohíbe textualmente el uso offline** y la descarga anticipada de teselas. |
| **Cloudflare Access** | Exige tarjeta y **el asiento se queda pegado**: con rotación de contratistas se llega a los 50 gratuitos sin tener 50 personas, y los nuevos quedan **bloqueados**. |
| **Microservicios · Kubernetes · gRPC · VPS propio · app nativa** | Sobre-ingeniería para un equipo de una persona más IA. La escala la da la plataforma (`CLAUDE.md §3.4`). |

### Correcciones que el comité introdujo sobre el análisis previo

1. **Sobre el presupuesto.** Se había concluido que, al estar el plan Blaze ya activo en el proyecto
   hermano, la tarjeta dejaba de ser un problema. **Es cierto pero insuficiente:** el riesgo real no
   es la tarjeta, es que ese plan **no tiene techo de gasto**. El criterio correcto no es "gratis"
   sino **"acotado"**.
2. **Sobre el coste como criterio.** Se calculó que a la escala del parque el almacenamiento es
   calderilla (400 líneas × 2 campañas × 5 años ≈ 70 GB ≈ 1,35 USD/mes) y que por tanto el coste no
   decide. **El comité lo afinó:** lo que decide no es el precio sino el **modo de falla** de cada
   proveedor cuando se pasa del límite — apagar, cobrar, o dejar la base en solo lectura.
3. **Sobre la compresión de fotos.** Con 177 KB de media, el archivo **ya contiene derivados
   comprimidos**: comprimir no ahorra un byte de lo que circula hoy. Los 30 MB se arreglan
   **partiendo el entregable en dos archivos**, no comprimiendo lo ya comprimido. La compresión en
   dispositivo es requisito de F4 (cuando la cámara nativa entregue 3-5 MB por foto), no de hoy.

### Corrección de un hecho que se había afirmado mal

Se dijo —y así se le pasó al comité— que el HTML *"funciona 100 % offline"*. **Es falso para el
mapa.** Verificado en el código:

```js
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', …)
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/…')
```

Sin señal el mapa es un lienzo gris. Lo que sí funciona offline son los **datos**, el **cálculo** y el
**esquema geométrico** (el propio HTML lo declara en ese título). Consecuencia: Protomaps/PMTiles no
es una mejora opcional, **tapa un agujero que ya existe hoy en campo** — y de paso retira una
dependencia de dos servidores de teselas cuyos términos no permiten este uso. → `30 · L-10`.

### Puntos ciegos que cazó el peer review anónimo (y que el propio comité no vio)

1. **«Todos validan la copia; nadie valida el original — y el que firma es el Ingeniero.»** Las
   pruebas de oro comprueban que el sistema nuevo reproduce al viejo, no que el viejo estuviera bien.
   Mitigado en parte: la geodesia y la resistencia **sí** se validaron contra referencias externas
   (constantes WGS84, tabla de fabricante). **No mitigado:** cambio de estado y vano peso → `40 §8` y
   `TODO-08`.
2. **«Nadie definió qué recibe y qué firma el cliente.»** Todos los criterios de aceptación eran
   internos. El único que importa es *línea entregada a AFINIA y aceptada por escrito*. → pregunta 1
   del anexo.
3. **«Treinta hallazgos y ni uno de seguridad»**, en un proyecto cuyas lentes hacen obligatoria la
   seguridad por diseño y cuya restricción dura son datos de un cliente del grupo EPM bajo Ley 1581.
   Corregido en la sección D del crudo y en `CLAUDE.md §3.1`.

### Decisión del Ingeniero que modifica el veredicto

El comité recomendaba **repositorio privado**. El Ingeniero decidió **público** (2026-07-29). Se
acata, y cambia dos cosas:

- **A favor:** GitHub Actions es gratuito e ilimitado en repos públicos (los 2.000 min/mes eran una
  restricción de repo privado). El argumento contra GitHub Pages **no cambia**: sigue descartado por
  la prohibición de uso comercial y por la ausencia de control de acceso al sitio.
- **En contra:** la regla *"cero bytes de cliente en el repositorio"* pasa de buena práctica a
  **condición de supervivencia**. Está en `CLAUDE.md §3.1`, en `.gitignore` por patrón, y ya cazó una
  fuga real en esta misma sesión (una prueba unitaria llevaba las coordenadas de los apoyos 1 y 2 de
  LN-627; corregida antes del primer commit).

### Consecuencias

- **Hoy el coste es $0 y no hay ningún proveedor** que pueda cobrar, apagar o cambiar términos,
  porque no hay proveedor: F0 a F4 corren enteras en la Mac.
- **El primer peso aparece en F6**, y solo si F5 se disparó antes: ~$5/mes de cómputo, y solo en
  meses de campaña ($15/año estacional, $60/año continuo). Lo autoriza el Ingeniero con la tabla
  delante. *La cifra de "$420/año" que circuló en una versión intermedia del comité **se retiró**:
  no tenía desglose y sumaba un proveedor de mapas que el propio documento había descartado.*
- **F5 (la nube) puede no construirse nunca, y eso sería un éxito, no un fracaso.** Solo se construye
  si se dispara: cuando los minutos de fusión manual al cierre de campaña lo justifiquen.
- La decisión queda **pendiente de segunda opinión externa** (`TODO-01`).

### Crudo de respaldo

`../brain-private/mantenimiento-lineas-at/research-archive/2026-07-28-comite-vision-arquitectura.md`
(477 KB: hechos con fuente, las tres síntesis completas, los peer reviews anónimos y los fallos
señalados por ronda).
Prompt del Consejo Externo: `…/2026-07-28-consejo-externo-prompt.md`.

---

## ADR-002 · 2026-07-29 · Integración del Consejo Externo (Gemini 3.1 Pro)

**Estado:** ✅ Cerrado. Enmienda ADR-001 en tres puntos y lo confirma en el resto.

### Contexto

`ADR-001` quedó marcado *NO revisado externamente*. Se corrió el Consejo Externo con **Gemini 3.1 Pro
(High)** vía Antigravity, aplicando **anti-anclaje R1**: se le entregó el problema **CRUDO** —con las
opciones descartadas y las invariantes— **sin contarle el veredicto del comité**, para que decidiera
por su cuenta. Si converge, es señal fuerte; si diverge, ahí está el valor.

Se integra como **un peer review más**, nunca como oráculo: se adopta lo correcto y **se refuta con
razones** lo que no lo es.

### Dónde convergió sin saber lo que habíamos decidido (señal fuerte)

Llegó de forma independiente a: **R2 para las fotos por su egreso a coste cero** · **Cloudflare Pages
para el frontend** · **PMTiles + MapLibre, y explícitamente NO cachear teselas con el Service Worker**
· **IndexedDB, no LocalStorage** · **activos de mutación lenta separados de eventos inmutables
append-only** · **el motor de cálculo como librería pura aislada del framework** · **la topología del
tramo de tensión modelada explícitamente**. Siete coincidencias desde cero refuerzan ADR-001.

> La tercera de esas coincidencias ya está implementada: `nucleo/` son funciones puras sin DOM, sin
> red y sin framework, con 53 pruebas. El consejo lo señaló como riesgo a evitar; aquí ya estaba
> evitado.

### ENMIENDA 1 (ADOPTADA) — Sincronización bifurcada: el dato crítico nunca viaja detrás de una foto

**Su fallo fatal, y tiene razón.** El comité había resuelto la *resiliencia* del envío (reanudable
foto por foto, contador "142 de 209", partido en paquetes, cuarentena en vez de rechazo) pero **no la
PRIORIDAD**: nada impedía que un hallazgo de 5 KB —*"retenida rota con riesgo de caída"*— quedara
encolado detrás de 18 MB de fotografías y muriera en un timeout de 3G rural. La emergencia estructural
no llegaría, y nadie se enteraría.

**Se adopta:** dos canales separados. Los **datos relacionales suben primero**, solos, en su propia
transacción. Las **fotos van a una cola asíncrona de segundo plano**. Una inspección puede quedar
`sincronizada` con sus fotos `pendientes`, y eso es un estado válido y visible, no un error.

Se combina con lo que ya traía el comité: la cola solo se vacía contra **acuse explícito**, y se
purga lo replicado, jamás lo capturado.

### ENMIENDA 2 (ADOPTADA) — Mecanismos concretos que el comité dejó al nivel de principio

| Qué | Lo que decía ADR-001 | Lo que aporta el consejo |
|---|---|---|
| Dónde vive el mapa offline | "PMTiles + MapLibre" | **Origin Private File System (OPFS)**, descargado **explícitamente en la oficina con WiFi**. La caché del Service Worker no sirve: el sistema operativo la purga cuando le falta memoria, y la cuadrilla llega al monte con un lienzo gris. |
| Resolución de conflictos | "explícita" | **`base_revision_id`** en cada registro al descargarlo. Si al subir no coincide con el del servidor, el evento **NO se pierde**: va a `conflictos_pendientes` y la interfaz de oficina obliga a fusionar a mano. |

> **Matiz obligatorio sobre el conflicto:** el consejo dice *"la Cloud Function rechaza el UPDATE"*.
> **Rechazar está prohibido** por el guardarraíl de `CLAUDE.md §1`: una restricción que RECHAZA
> convierte un problema de calidad de dato en pérdida de jornada de campo. Se implementa como
> **aceptar y poner en cuarentena**, nunca como rechazar y descartar. Con ese cambio, el mecanismo
> es correcto y **es independiente del motor**: funciona igual en SQLite, en D1 o en Firestore.

### ENMIENDA 3 (ADOPTADA) — Tres guardarraíles de código contra errores que la propia IA induce

1. **Inercia del Base64.** Al portar desde un HTML que guarda fotos en base64, la tentación es
   guardarlas como texto. Reventaría el límite de 1 MiB por documento y colapsaría la RAM del móvil
   al parsear. **Las fotos viajan como binario (`Blob`), jamás como texto.**
2. **No "reactificar" el motor.** El cálculo no entra en hooks ni en el ciclo de vida de ningún
   framework: bucles de render y pérdida de precisión. **Ya cumplido en `nucleo/`.**
3. **Invalidación por tramo de tensión.** Editar mecánicamente un apoyo debe **invalidar y recalcular
   todo su tramo**, no solo ese apoyo. Si no, las validaciones de coherencia dan falsos positivos.
   `nucleo/mecanica.js` ya calcula por tramo con el VIR; falta que la **capa de datos** dispare esa
   invalidación — se anota como requisito de F3.

### REFUTACIÓN 1 — «Reusa Firebase (Firestore + Auth + Functions)»: no se adopta para F0–F5

Su argumento de fondo es **bueno y se reconoce**: la seguridad declarativa de `firestore.rules` es más
segura que un control de acceso escrito a mano por una IA, y para un dueño que no programa eso pesa.
Pero la recomendación no sobrevive a tres comprobaciones:

1. **Cloud Functions no existen en el plan gratuito.** Su diseño necesita una función de servidor para
   firmar las URLs de R2 y para el chequeo de revisión. La tabla oficial marca *"Not applicable"* en
   Spark y el despliegue exige Blaze — **un plan sin techo de gasto**. Eso viola frontalmente la
   invariante nº 2 que se le entregó en el propio prompt ("que nadie reciba una factura sorpresa").
   **El consejo no abordó este punto en ningún momento.**
2. **El "activo gigante" de 700 líneas no es transferible.** Verificado con mis propios ojos:
   `firestore.rules` del proyecto hermano tiene **699 líneas, 19 funciones auxiliares y 37 bloques
   `match`**. De las 19 auxiliares, **solo 4 son genéricas** (`isSignedIn`, `isAdmin`, `hasProfile`,
   `isTeamMember`); las otras 15 validan dominio de transformadores
   (`isCodigoSuministroValido`, `isEstadoRepuestoValido`, `isTipoActivoValido`…). Y **los 37 bloques
   `match` son colecciones de transformadores** (`contramuestras`, `historial_hi`,
   `acciones_refrigeracion`, `macroactividades`…): **cero** aplican a líneas, apoyos, vanos o
   inspecciones. Lo reutilizable es el **patrón** (unas decenas de líneas), no el activo.
3. **Su número de egreso está mal.** Afirma que 5 gerentes descargando 150 MB *"volarán la capa
   gratuita en días"*. La cuota gratuita verificada de un bucket nuevo son **100 GB/mes descargados**;
   ese escenario son ~16 GB/mes, el **16 %**. Sería casi correcto solo en buckets antiguos
   `*.appspot.com` (1 GB/día). La conclusión —R2 es mejor por egreso— es la misma, pero el número que
   la sostiene no.
4. **Falló el dato decisivo:** Firebase Storage no es que sea *caro*, es que **no existe** en el plan
   gratuito, y su requisito de facturación pasó a ser total y **retroactivo el 03-02-2026**.

**Y sobre todo, responde a la pregunta equivocada.** ADR-001 no elige Firestore ni D1 *hoy*: elige
**ningún proveedor** hasta F5. En F0–F4 todo corre en la Mac del Ingeniero, así que **no hay superficie
de control de acceso que proteger** y el argumento del consejo no tiene dónde aplicarse. Diseñó el
estado final y saltó las fases; y F5 puede no llegar nunca —depende de la respuesta de AFINIA a las
8 preguntas—, en cuyo caso habríamos pagado la complejidad de Firebase por nada.

> **Condición explícita de reapertura:** si F5 se dispara, este argumento **vuelve a la mesa con todo
> su peso** y se compara *seguridad declarativa de Firestore* contra *D1 + Workers*, con el coste de
> Blaze sin techo puesto en la balanza. Queda anotado para no re-litigarlo desde cero.

### REFUTACIÓN 2 (la más importante) — «NO guardes la flecha, el vano viento ni la ampacidad»

El consejo propone que la base sea "tonta": solo mediciones crudas, y que **todo se recalcule en el
cliente al renderizar**. Su motivo: si mañana cambia el criterio de la catenaria, el histórico sigue
siendo válido.

**Se refuta, y es la divergencia que más importa del proyecto.**

El Ingeniero **firma los informes con su matrícula profesional**. Si en 2029 alguien pregunta *"¿qué
certificó usted en 2026?"*, recalcular con el motor de 2029 devuelve **la respuesta de 2029**, no la
que él firmó. Con el diseño del consejo, **el documento firmado sería irreproducible** — que es
exactamente el riesgo legal que este sistema existe para cerrar (`ADR-001 §1`).

**Pero su preocupación es legítima**, así que no se descarta: se resuelve con las dos cosas a la vez,
que no son alternativas sino capas distintas.

| Capa | Qué guarda | Para qué |
|---|---|---|
| **Dato crudo** | mediciones tal como se tomaron, jamás derivados | permite **recalcular** con cualquier criterio futuro — el punto del consejo, adoptado |
| **Dictamen** | el resultado **más la versión del motor y las hipótesis** con que se produjo | permite **reproducir el informe firmado** años después — el punto del comité, conservado |

La regla de `CLAUDE.md §3.1` se mantiene: *todo resultado guardado lleva con qué versión del motor y
con qué hipótesis se produjo*. Un dictamen es una **foto fechada de un juicio profesional**, no una
caché del cálculo: por eso no se recalcula al vuelo ni se sobrescribe.

### Consecuencias

- **ADR-001 deja de estar "no revisado externamente".** Su núcleo sale confirmado por una familia de
  modelos distinta que partió del problema crudo.
- Entran tres enmiendas al diseño: **canal de sincronización bifurcado**, **OPFS + revisión base con
  cuarentena**, y **tres guardarraíles de código**. Se reflejan en `CLAUDE.md §1`.
- Queda anotada una **condición de reapertura** para la elección de base de datos si F5 se dispara.
- No se convoca desempate con una tercera familia (§0b): comité y consejo **no divergen de frente**;
  convergen en lo esencial y las diferencias quedaron resueltas con evidencia verificable.

### Crudo de respaldo

`../brain-private/mantenimiento-lineas-at/research-archive/2026-07-29-consejo-externo-respuesta.md`
(respuesta íntegra, sin editar) · prompt que la originó: `…/2026-07-28-consejo-externo-prompt.md`.

---

## ADR-003 · 2026-07-29 · El Ingeniero fija alcance y presupuesto

**Estado:** ✅ Decidido por el dueño. Enmienda supuestos de ADR-001 y dispara la condición de
reapertura de ADR-002.

### Contexto

ADR-001 dejó ocho preguntas para AFINIA con una **regla de default** por si nadie contestaba. Dos de
esos defaults eran los más caros del documento:

- *Pregunta 2 — ¿AFINIA ya tiene Maximo, SAP PM o ArcGIS?* → default: **"se asume que SÍ"**, y en ese
  caso el alcance se congelaba en capturador + exportadores, suspendiendo todos los módulos de
  gestión. El propio ADR decía que esa pregunta *"puede ahorrar el 70 % del alcance"*.
- *Restricción de presupuesto* → reformulada como **"cero cobro, siempre; y ninguna pieza con gasto
  ILIMITADO, nunca"**.

### Decisión del Ingeniero (literal, 2026-07-29)

> *"Esta es una herramienta independiente que no tiene nada que ver con las herramientas Maximo o
> SAP, la idea es que este sistema que vamos a trabajar tenga todo lo que se necesite."*
>
> *"Soy consciente de que Firebase y Cloudflare tienen unos límites o techos en los que son gratis,
> estoy dispuesto a asumirlo si me paso."*

### Qué cambia

**1. El alcance es la plataforma completa.** La pregunta 2 queda **cerrada por decisión del dueño**,
no por respuesta de AFINIA: da igual lo que AFINIA tenga, este sistema no se integra con ello y debe
ser autosuficiente. Se retira el default de "congelar en capturador + exportadores" y se retira la
suspensión de los módulos de gestión. **Quedan 7 preguntas abiertas**, no 8.

**2. F5 deja de ser condicional.** ADR-001 decía que *"F5 puede no construirse nunca, y eso sería un
éxito"*. Con alcance completo, **la sincronización entre campo y oficina entra en el plan**. Sigue
siendo la fase 5 —no se adelanta—, pero se diseña sabiendo que llega: el esquema local de F3 nace
pensado para sincronizar, no como un archivo suelto que después habrá que retorcer.

**3. Se dispara la condición de reapertura de ADR-002.** Aquella condición decía: *"si F5 se dispara,
vuelve a la mesa la comparación seguridad declarativa de Firestore contra D1 + Workers, con el coste
de Blaze sin techo en la balanza"*. Ambas premisas cambiaron: F5 es seguro y el coste se acepta.
**La comparación se rehará antes de empezar F5**, no ahora: F1, F2 y F3 no dependen de ella y
adelantarla sería decidir sin la información que esas fases van a producir (volumen real de datos,
número de cuadrillas, respuesta de AFINIA a la pregunta de nube fuera de Colombia).

### Lo que la decisión NO cubre, y queda como guardarraíl operativo

Aceptar un coste **no es lo mismo** que aceptar responsabilidad **ilimitada**, y esa distinción es la
que motivó el criterio de ADR-001. El plan Blaze de Firebase **no tiene techo de gasto**: su propia
documentación dice *"you cannot cap your usage"* y que las alertas *"do not cap your usage or
charges"*. Un bucle mal escrito, un bot o una descarga masiva no producen una factura de 20 dólares:
producen la factura que salga.

Por eso se conserva, ahora como procedimiento y no como restricción de diseño:

1. **Alerta de presupuesto configurada antes de que el servicio reciba tráfico real**, con umbral
   acordado con el Ingeniero.
2. **Se prefiere, a igualdad de prestaciones, el servicio que APAGA sobre el que COBRA** — no por
   ahorrar, sino porque un corte se arregla y una factura no se deshace.
3. **Ningún servicio de pago se activa sin decirlo en el mismo turno**, con el número al lado
   (política git del ecosistema: se informa, no se pide permiso, pero se informa **siempre**).

### Consecuencias

- Se retira del ADR-001 el escenario de "alcance recortado al 70 %".
- El modelo de datos de F3 se diseña **para sincronizar**, con la columna de organización y el
  `base_revision_id` de ADR-002 desde el primer día.
- La elección de backend de F5 se decide **al entrar en F5**, con datos reales en la mano.
- Presupuesto esperado sin cambios respecto a ADR-001 mientras no llegue F6: **$0**.

---

## ADR-004 · 2026-07-29 · Subsistema de IA y contrato para trabajar en paralelo

**Estado:** ✅ Decidido (comité acotado de 5 agentes) · ⚠️ contiene **un desacuerdo con el encargo
literal del Ingeniero**, planteado abiertamente en «Lo que se rechaza del encargo».

### Contexto

El Ingeniero fijó el rumbo: *"un sistema web completo de los más altos estándares, súper escalable,
inteligente y avanzado; usaremos la API de Anthropic para enlazar LLMs que analicen en vivo"*, con el
stack **Cloudflare Pages + R2 · Firebase (Firestore + Auth) · Cloud Functions en Node · GitHub**, y
pidió trabajar **frontend y backend en paralelo**.

Nada de eso estaba deliberado: ADR-001 y ADR-002 no contemplaban subsistema de IA.

### La regla madre del subsistema

> **La IA mira y redacta; el núcleo mide; el ingeniero decide.
> Nada que haya tocado el modelo entra a un informe sin que una persona lo confirme, una por una.**

Tres verbos, tres dueños. El modelo **mira** (una foto, un PDF, una frase de la cuadrilla) y
**redacta** (prosa alrededor de números que le vienen dados). `nucleo/` es el único que **mide**. El
ingeniero con matrícula es el único que **decide**.

**No es una política escrita: se implementa como permisos.** El modelo solo puede escribir en
`sugerencias/`; las reglas de Firestore le **niegan** escribir en `hallazgos/`, `calculos/`, `apoyos/`
o cualquier campo que alimente una firma. Aunque el código se escriba mal —y lo escribe un asistente
a alta velocidad— la doctrina se cumple porque la máquina no permite otra cosa.

Es la aplicación directa de la doctrina de `CLAUDE.md §4`: *el veredicto sale del VALOR contra la
NORMA, nunca del texto de un modelo de lenguaje*.

### Lo que se rechaza del encargo (y por qué)

**El análisis "en vivo" durante la inspección NO se construye.** Tres razones, ninguna opinable:

1. **En el trazado no hay señal.** Es el requisito operativo fundador del proyecto.
2. **Choca con el guardarraíl «la app jamás bloquea la captura»**: poner al modelo en la ruta crítica
   del trabajo de campo es exactamente lo prohibido.
3. **Anclaje.** Mostrar la sugerencia *antes* de que el linero forme su juicio destruye el único
   control real que existe. El día que el modelo diga "cadena en buen estado" y el técnico deje de
   mirar, se perdió la inspección.

**"En vivo" se redefine como *la misma noche*, no *durante la subida*.** La IA es tarea de gabinete.
Si el Ingeniero quiere sostener el encargo literal, es su decisión — pero queda registrado que el
comité la desaconseja por seguridad de las cuadrillas, no por dificultad técnica.

### El agujero de seguridad que se tapa el día 1

Cloudflare Pages sirve un paquete público que contiene el `projectId` de Firebase. **Sin App Check en
modo obligatorio, cualquiera con el navegador abierto tiene un proxy anónimo a la API de Anthropic
pagado por el Ingeniero.** La clave nunca se filtra y aun así vacían la cuenta.

Cierre: **App Check obligatorio** + solo funciones `onCall` (jamás `onRequest` abierta) + `auth`
verificado + rol en *claim* + allowlist de dominio de correo. Del día 1, no de la fase 2.

### Dónde corre cada cosa

```
NAVEGADOR/TELÉFONO   Cloudflare Pages + SDK de Firestore + MapLibre
                     NO tiene clave · NO elige modelo · NO manda prompt
                     Solo escribe: solicitudes_ia/{id} = {caso_de_uso, referencias}
        │ datos                                    │ binarios
        v                                          v
FIREBASE             Firestore + Auth + App Check   ◄──►   CLOUDFLARE R2
                     el documento nuevo dispara ↓          fotos, nunca salen
        v
CLOUD FUNCTIONS v2 · Node 22 — ÚNICO lugar que conoce la clave
  funciones/ia/pasarela.js ← único archivo que importa el SDK
  presupuesto → idempotencia → minimización → prompt versionado → llamada
  → validación de esquema → auditoría → escribe en sugerencias/
        v
  api.anthropic.com
```

**Por dónde NUNCA pasa la clave:** navegador, teléfono, paquete de Pages, Worker de Cloudflare, R2,
documento de Firestore, variable del build, el repositorio (que es público), un mensaje de error, un
log. Dos entornos separados (`dev` y `prod`) para que una prueba en bucle no se coma el presupuesto.

### Los cinco casos de uso que SÍ, por dinero ahorrado

| # | Caso | Por qué | Cómo se verifica que no alucinó |
|---|---|---|---|
| **1** | **Control de calidad de la evidencia** — revisa la CAPTURA, no la línea: foto movida, foto que no muestra lo que dice el formulario, placa ilegible, apoyo sin foto | **Es el que paga el proyecto.** El costo real del negocio no es el análisis: es el **re-viaje** de 4-6 h por trocha. Evitar uno al mes lo paga varias veces. Riesgo de firma: cero | El 80 % lo hace código determinista (nitidez, exposición, duplicados por hash). Al modelo se le pregunta **una sola cosa** que el código no sabe. Si discrepan, **gana el código** |
| **2** | **Redacción del informe** sobre números ya calculados | Convierte una tarde de escribir en 20 min de revisar | El modelo escribe `{{marcador}}`; **el servidor sustituye el número**. Verificador de dígitos: cualquier cifra fuera de la lista blanca rechaza el texto entero. **El modelo no cita norma, jamás** |
| **3** | **Normalización del texto de campo** a taxonomía cerrada | Hace posibles las estadísticas del parque, que hoy no existen porque cada linero escribe distinto | El modelo elige de una lista; valor fuera del enum invalida la respuesta. Muestreo ciego del 10 % |
| **4** | **La pregunta ante una incoherencia** | La incoherencia la detecta una regla determinista de `nucleo/`; el modelo solo **formula la pregunta** al técnico | No emite juicio, solo pregunta |
| **5** | **Extracción de ficha técnica de PDF de fabricante** | Ahorra horas de tecleo | Sin página y cita literal, el campo se descarta · chequeo de rango físico contra `nucleo/` · confirmación humana. **Mayor superficie de inyección del sistema** |

**Regla transversal:** si el modelo falla, el sistema hace **exactamente lo que hacía sin IA**. Y la
**ausencia de bandera nunca es aprobación**: el sistema jamás marca algo como bueno.

### Control de coste — cuatro peldaños que apagan

| Peldaño | Umbral | Qué se apaga |
|---|---|---|
| 1 | 80 % del tope diario | El control de calidad nocturno de fotos (el caro, el de visión) |
| 2 | 100 % del tope diario | Todo salvo la redacción de informe bajo demanda |
| 3 | 100 % del tope mensual | La pasarela responde `apagado_por_presupuesto` **sin llamar** |
| 4 | Tope del workspace en la consola de Anthropic | La API devuelve error. **El freno que no se puede programar mal** |

Más un interruptor manual `config/ia.enabled` que el Ingeniero baja sin desplegar código, y una
alerta de GCP que lo baja sola. Se enciende a mano, siempre.

Números de arranque, revisables al mes: **workspace prod USD 60/mes · dev USD 15/mes · proyecto USD
3/día · por usuario 40 llamadas/día y USD 0,50/día**. `max_tokens` fijado en el servidor por caso de
uso, temperatura 0, imágenes a 1.568 px sin EXIF (el original de 12 MP se queda en R2). Modelo
escalonado; **los identificadores exactos y los precios se toman de la documentación al escribir el
código —skill `claude-api`—, jamás de memoria**, y se fija el snapshot fechado: un alias tipo "el
último" convierte el histórico en irreproducible.

**Guardia en CI, la pieza más barata y la que más dinero salva:** el SDK solo puede importarse en
`funciones/ia/pasarela.js`. Un `grep` en GitHub Actions rompe el build con *"llamada al modelo fuera
de la pasarela: prohibido"*. Existe porque a un asistente le resulta natural importar el SDK en el
archivo que tiene delante.

### Trazabilidad

Colección `llamadas_ia/{id}` de **escritura única**: las reglas no permiten `update` ni `delete` a
nadie, ni al administrador. Guarda quién y cuándo · identificador **exacto y fechado** del modelo,
versión y hash del prompt, versión del esquema, **versión de `nucleo/`** · referencias y hashes de la
entrada (**nunca los bytes, nunca identificadores de cliente**) · salida cruda · tokens y coste · y
**el desenlace humano**: `aceptada | editada | rechazada`, con quién y el diff.

> *Sin ese último campo no hay métrica de acierto, y sin métrica de acierto no hay derecho a usar el
> subsistema.*

**Tres métricas mensuales:** aceptación humana por caso de uso (si baja del 70 % en 30 días, **ese
caso se apaga solo**) · aceptación **por clase** de hallazgo, no en agregado · y aceptación **por
encima del 92 %**, que no se celebra sino que **se audita**: significa que la gente firma a ciegas.

### El contrato frontend ↔ backend

**Con Firestore no hay API que diseñar, y eso engaña.** El frontend habla directo con la base. El
contrato real son tres cosas que casi nadie trata como contrato, y si no se congelan antes de la
primera línea, "trabajar en paralelo" son dos proyectos que se enteran en la semana 6 de que no
encajan.

Un paquete `contratos/` con esquemas Zod como **única fuente de verdad**: de ahí salen los tipos de
ambos lados, el validador del servidor, el esquema que se le impone al modelo y los datos de prueba.
Nadie escribe tipos a mano.

1. **Nueve tipos de documento, ni uno más en v1**: `lineas`, `apoyos`, `inspecciones`, `evidencias`,
   `solicitudes_ia`, `sugerencias`, `hallazgos`, `calculos`, `llamadas_ia`.
2. **Tres funciones invocables**: `crearSolicitudIA`, `confirmarSugerencia`, `estadoContrato`.
3. **Una máquina de estados idéntica en las dos mitades**: `pendiente → en_proceso → (listo |
   fallido | rechazado)`, con motivos cerrados. **El frontend pinta los cinco desde el día 1** — es
   exactamente donde el paralelo se estrella: el front hace el camino feliz, el back devuelve
   degradaciones, y juntarlos cuesta una semana de parches.
4. **Las reglas de seguridad son parte del contrato**, no del backend.
5. **Prohibido por diseño** que el frontend mande prompt, modelo, temperatura o `max_tokens`: sería
   una fuga de presupuesto y un *jailbreak* gratis.

**Se PROHÍBE que el frontend monte su propio simulador** (MSW, json-server, JSON a mano): crea una
segunda verdad que no modela las reglas de seguridad —que aquí *son* el contrato—, ni la cola sin
señal, ni los estados feos. En su lugar: **emulador de Firebase + `npm run sembrar`** con ~30
documentos de oro generados desde los mismos esquemas, y una costura `ProveedorModelo` con
`ProveedorAnthropic` y `ProveedorFalso` (determinista, latencia simulada, 10 % de fallo inyectado).

> **Consecuencia práctica, la más importante del documento:** el flujo completo se construye, se
> despliega y se usa **sin gastar un solo token y sin necesitar todavía los papeles legales**.
> Encender el modelo real es cambiar una variable de entorno.

### Orden de construcción

| Semana | Qué queda desplegado |
|---|---|
| **1** | Contrato v0.1 congelado. En Cloudflare Pages: entrar, lista de líneas, ficha de apoyo, contra un Firestore de desarrollo sembrado. Feo pero real |
| **2** | Flujo de IA **completo** con `ProveedorFalso`: solicitud → borrador → confirmación → hallazgo, con reglas de seguridad y los cinco estados pintados. **Aquí muere el 80 % del riesgo de integración sin gastar un dólar** |
| **3** | Proveedor real solo para el caso 2 (redacción). **Puerta dura: no arranca sin los dos papeles legales firmados** |
| **4** | Caso 1 (control de calidad), con su conjunto dorado de 30 casos construido **antes** del primer prompt en producción |
| **5–6** | Normalización, incoherencias, extracción de PDF |

### Frontera legal

AFINIA es **responsable** del dato; el Ingeniero es **encargado**. Antes de la primera llamada real
con datos de campo hacen falta dos papeles: **autorización escrita del cliente** para usar un
subencargado en el exterior, y el **acuerdo de tratamiento de datos** con el proveedor. Hasta que
existan, el sistema corre con `ProveedorFalso` — que es lo que hará las dos primeras semanas de todos
modos.

### Lo que NO se construye todavía

| No se construye | Señal que lo dispara |
|---|---|
| **Pre-hallazgo por foto** (que el modelo proponga el defecto de la línea) | 300 hallazgos humanos confirmados con foto **y** ≥70 % de acuerdo **por clase** en muestreo ciego. Entonces entra clase por clase, solo **añadiendo** a la cola de revisión, jamás cerrando nada |
| API de lotes | Gasto diario real > USD 1,50 tres días seguidos |
| Caché del prompt fijo | Un caso de uso pasa de 100 llamadas/día |
| RAG normativo | Nunca por sofisticación. Solo con corpus real > 10.000 páginas **y** una pregunta que `nucleo/` no respondió en tres meses |
| **Auto-aceptación de sugerencias, en cualquier forma** | **Ninguna. Nunca.** Única línea del documento sin condición de reapertura |

### El examen final del diseño

> **Si el sistema no es útil y vendible con el subsistema de IA apagado, el problema no es la IA.**

### Crudo de respaldo

`../brain-private/mantenimiento-lineas-at/research-archive/2026-07-29-arquitectura-ia-y-paralelo.md`

---

## ADR-005 · 2026-07-29 · Framework del frontend: React 19 como aplicación de una sola página

**Estado:** ✅ Decidido (comité de 11 agentes: 2 verificadores con fuente + 4 expertos + peer review
anónimo + presidente). ⏳ Pendiente de aprobación del Ingeniero.

### Contexto

`web/` son hoy ~300 renglones de TypeScript sin framework. El alcance creció (ADR-003: plataforma
completa) y entró un subsistema de IA con cinco estados que pintar (ADR-004). La pregunta —qué
framework— es cara de revertir, y **este es el momento más barato que va a existir para decidirla**.

**Criterio dominante, declarado al comité de entrada:** el código entero lo escribe una IA. No hay
equipo de frontend, no hay revisor humano de código, y dentro de 18 meses otra sesión sin memoria de
ésta tiene que abrir el repositorio y entender qué pasa. Bajo ese criterio, *un framework que se
escribe de forma predecible vale más que uno técnicamente superior*.

Tres de los cuatro expertos recomendaron React como SPA. El cuarto —el escéptico, cuyo encargo era
defender que no se usara ninguno— sostuvo seguir sin framework.

### Decisión

> **React 19 como aplicación de una sola página sobre el Vite que ya existe: sin Next.js, sin Server
> Components, sin React Compiler, sin ningún meta-framework.**

React se usa **únicamente para pintar**. Todo lo que importa —el cálculo, la base local, la cola de
sincronización, el informe firmado— vive fuera de él.

### Por qué ése

**1. Es el único candidato donde el error conocido de la IA es el comportamiento correcto.**
El hecho más sólido del expediente no es que React gane pruebas de rendimiento: es que **el asistente
escribe la versión vieja del framework dentro de la nueva**. Escribe Vue 2 dentro de Vue 3, Svelte sin
runas dentro de Svelte 5. En React ese "dialecto viejo" —aplicación de una sola página, en el
navegador, sin servidor de renderizado— **es exactamente lo que este proyecto necesita**. Elegimos que
la deriva apunte hacia donde queremos ir: no pagamos el impuesto, lo cobramos.

Y hay un cerrojo verificable por máquina: como no hay servidor de renderizado en el despliegue,
cualquier alucinación con forma de Next.js (`'use client'`, `getServerSideProps`, `next/image`)
**rompe la compilación en CI**, ruidosamente, antes de llegar a nadie.

**2. La red de seguridad tiene que poder guardarse en el repositorio.** Es lo que decide contra
Svelte, que era el rival serio.

**3. Es lo que menos estorba a la parte que de verdad decide el proyecto** — que no es la interfaz.

### Por qué no los otros

| Descartado | Motivo |
|---|---|
| **Seguir sin framework** (la opción actual) | No estamos eligiendo "sin framework": estamos eligiendo **escribir uno nosotros**. Datos que llegan solos, cola con estados por documento, tablas de cientos de apoyos, cinco estados de IA — esa capa se escribe igual. La pregunta es si la escribe React, con millones de ejemplos y una regla automática que audita sus errores, o **cuarenta sesiones distintas de IA, cada una a su manera, sin un solo ejemplo en el mundo fuera de este repositorio**. Un framework casero tiene, por definición, **cero datos de entrenamiento**: el peor escenario posible para el único autor que este proyecto va a tener. Y su mejor defensa —"escribimos una convención"— es prosa en un archivo: **ningún sistema automático hace cumplir un párrafo** |
| **Svelte / SvelteKit** | El rival serio. Su red de seguridad no cabe en el repositorio · **SvelteKit 3 está en prelanzamiento esta misma semana** con cambio obligatorio de configuración y de variables de entorno: firmar hoy es firmar una migración a ciegas ejecutada por una sesión sin memoria · su modelo de datos envuelve los objetos, que es el fallo silencioso que mata una app de captura de fotos |
| **Vue / Nuxt** | Tiene el mejor dato objetivo de la mesa: **casi seis años sin ruptura**. Y aun así cae: el fallo documentado del asistente con Vue produce **dos idiomas conviviendo en el mismo repositorio**, y hay que leer cada archivo entero para saber en cuál está escrito. Su modo nuevo se activa archivo por archivo: un tercer idioma |
| **Astro** | **Dos versiones mayores en 3,5 meses** (6.0 en marzo, 7.0 en junio de 2026). Cadencia incompatible con un mantenedor sin memoria |
| **Angular** | Notable: pasó a mayores anuales citando textualmente *"increased API stability for developers using agentic workflows"* — un framework optimizando su gobernanza **para** asistentes de IA. Aun así, peso y ceremonia desproporcionados aquí |

### Qué cambia en el repositorio

**Sobrevive intacto:** `nucleo/` con sus 53 pruebas · `contratos/` · Vite, TypeScript, GitHub Actions,
Cloudflare Pages y el modelo de despliegue entero.

**Se reescribe:** los ~300 renglones de `web/`. **Uno o dos días, no semanas.**

**Se añade, y es lo que de verdad cuesta:** la capa de datos (base local dueña de la verdad, cola de
envíos, revisión base y cuarentena) como **módulo puro hermano de `nucleo/` que no importa React**, e
`informes/` también puro.

> **El reparto honesto: la interfaz es el 20 %; la capa de datos, la cola y el informe son el 80 %.**
> Por eso esta decisión importa menos de lo que parece, y por eso hay que tomarla rápido y dejar de
> discutirla.

### Reglas de uso — ejecutadas por la máquina, no confiadas a la memoria

1. **Nada de Next.js ni meta-frameworks.** Una prueba revisa las dependencias y detiene el despliegue.
2. **Nada de Server Components ni React Compiler** sin decisión escrita nueva y aprobación del Ingeniero.
3. **Prohibida cualquier segunda capa de caché de datos.** La verdad está en la base local.
4. **Prohibido el "estado optimista" de React para la cola.** Esa herramienta espera segundos contra
   un servidor; aquí la confirmación puede tardar **días**. Y todo dato pendiente que solo viva en la
   memoria del framework **desaparece** cuando el teléfono mata la pestaña, sin avisar, con el técnico
   en mitad de una inspección.
5. **Ningún componente se conecta directamente a Firestore.** Ninguno.
6. Las piezas retiradas en React 19 quedan prohibidas por regla automática: algunas fallan en silencio
   y dejan un campo del formulario vacío sin que nadie se entere.

### Las dos cosas que el comité entero firmó sin ver, y que el presidente corrigió

**(a) Ninguna verificación pinta un píxel.** Tipos, reglas de estilo y pruebas unitarias no dibujan
nada — y **todos los miedos de este proyecto son visuales**: pantalla en blanco, tabla incompleta,
informe mal paginado, el estado "apagado por presupuesto" que nunca se dibuja. Entra una **prueba de
navegador con captura de pantalla** de los cinco estados y del informe, comparada contra imagen de
referencia. Es agnóstica del framework, vive en git y **es el revisor humano que no tenemos**.

**(b) La trampa de la tabla virtualizada — y es peligrosa.** Los cuatro expertos exigieron virtualizar
las tablas. Una tabla virtualizada tiene **30 filas de 400 realmente presentes**; el resto no existe
hasta que uno se desplaza. Imprimir o exportar a PDF imprime lo que existe. **La regla que los cuatro
firmaron produce un informe con el 90 % de los apoyos ausentes, y falla en silencio** — se ve bien en
pantalla. Se habría entregado a AFINIA con la matrícula profesional del Ingeniero al pie.

> **Regla que lo corrige, y que es más importante que la elección de framework: el informe NO se
> genera imprimiendo la pantalla.** `informes/` es un módulo puro, hermano de `nucleo/`, con plantilla
> versionada, que va **de los datos al documento**. Consecuencias: el informe deja de depender del
> framework · subir de versión React nunca podrá alterar en silencio un informe ya firmado · el mismo
> documento se regenera idéntico dentro de tres años · y la tabla tiene dos presentaciones sobre la
> misma fuente —resumida en pantalla, completa en papel— por diseño y no por parche.

### La prueba de arrepentimiento

**Sería un error si el framework acabara siendo el 60 % del código en vez del 20 %**, es decir, si la
lógica de negocio se colara dentro de los componentes. *Detección:* medición mensual automática de
cuántos renglones viven fuera de la interfaz. Si `nucleo/`, `contratos/`, la capa de datos e
`informes/` dejan de sumar la mayoría, es la alarma.

**Sería un error si el asistente resultara ya no escribir React mejor que las alternativas.** La
evidencia dura es de mayo de 2025, con modelos de otra generación, y no hay réplica. *La decisión se
apoya en el mecanismo —volumen de corpus, refuerzo del dialecto dominante—, no en el número.*
*Detección:* llevar la cuenta de cada vez que una sesión escriba código que no compila por confundir
versiones de API. Si a los seis meses el grueso de los errores es de React y no de Firestore o
MapLibre, la premisa se cayó.

### Crudo de respaldo

`../brain-private/mantenimiento-lineas-at/research-archive/2026-07-29-comite-framework-frontend.md`
(76 KB: hechos verificados con fuente y fecha, los cuatro aportes, el peer review anónimo y el
veredicto íntegro).

---

## ADR-006 · 2026-07-30 · Exportadores GPX/KML/CSV: paridad de formato con el módulo original, verdad del modelo corregido

**Estado:** ✅ Implementado (pestaña Exportar viva; 14 pruebas golden en `tests/exportar.test.js`).

### Contexto

La pestaña Exportar del módulo original generaba GPX 1.1, KML y CSV desde su tabla interna `S` de 26
puntos, donde **"vano anterior" era la distancia entre puntos GPS consecutivos, empalmes incluidos**
— la misma confusión de dominio que este sistema ya corrigió (un empalme no es apoyo; partía el vano
real E06→E07 de 247,8 m en dos falsos de 84,4 y 163,5). Había que decidir: ¿paridad ciega con el
original, o paridad de formato con la verdad del modelo corregido?

### Decisión

> **Paridad de FORMATO, verdad de MODELO.** Una única derivación pura
> (`web/src/exportar/levantamiento.js`, JS sin React) alimenta los tres generadores; los archivos
> salen de los datos, jamás de la pantalla (ADR-005). El CSV conserva el número del original como
> `Dist_punto_anterior_m` (trazabilidad del levantamiento) y `Vano_anterior_m` pasa a ser el vano
> real entre estructuras — el mismo que usan Mecánico, Fichas y Resumen. Los empalmes se exportan
> SIEMPRE (visibilidad íntegra) pero rotulados como lo que son, con su carpeta propia en KML.

Contratos de formato conservados del original: GPX topografix 1.1 con `wpt` (lat/lon a 6, cota a 3,
`sym` Flag Blue) + `trk`; KML con estilos `aabbggrr` y colores de tramo rotando
(`ff3b3bd6/fff5b04b/ff6fc45b/ff1f7ad6`, morado `#b06bd6` para empalmes); CSV con BOM UTF-8 +
`sep=;` + CRLF + punto decimal. Hora local América/Bogotá con el formato exacto del original.

### Alternativas descartadas

- **Replicar el original tal cual** (vano = distancia entre puntos consecutivos): reintroduce el
  error de dominio que costó detectar; los archivos contradirían a las demás pestañas del sistema.
- **Omitir los empalmes de los exportes**: pérdida de información del levantamiento real; viola la
  regla de no introducir regresiones de visibilidad.
- **Exportar "captando" la pantalla**: prohibido por ADR-005; irreproducible y no verificable.
- **Informe fotográfico y proyecto .json del original**: pospuestos a F4 — dependen de fotos y
  notas que el sistema aún no tiene, y aquí no se finge nada.

### Consecuencias

- Verificación de oro contra el fixture de la bóveda: GMS y horas locales idénticos al original en
  los 26 puntos; distancias GPS consecutivas conservadas ±1 cm; la divergencia E06→E07 = 247,8 m
  probada explícitamente; tramos 1-2-2-14-1-3. Las pruebas se saltan solas sin bóveda (CI).
- `aGMS` se movió a `web/src/vistas/gms.js` (JS puro) para que Node lo pruebe sin compilador;
  `vistas/formato.ts` lo re-exporta y las pantallas no cambiaron.
- La verificación con sesión viva quedó bloqueada por el clasificador (`30 · L-17`): pendiente de
  que el Ingeniero pruebe el clic de descarga con su sesión real.

### Crudo de respaldo

Los propios tests (`tests/exportar.test.js`) son la evidencia reproducible; los exportadores del
original están citados línea a línea en el commit `3c480d1`.

---

## ADR-007 · 2026-07-30 · Auditoría comparativa original-vs-web (7 dimensiones) y Ola 1 de nivel premium

**Estado:** ✅ Ola 1 ejecutada y en producción. Ola 2 → `10 · TODO-26…31`.

### Contexto

Orden del Ingeniero: análisis de fondo del módulo HTML original contra la web, parámetro por
parámetro, y llevar el proyecto a nivel premium para presentarlo a la compañía. Se corrió un comité
de **7 auditores Opus** (Resumen/mapa · Distancias · Fichas · Mecánico/parámetros · pestañas
faltantes · Exportar · transversal), ~1,1M tokens, 0 errores.

### Veredicto global del comité

**La aritmética está migrada sin una sola desviación** (KPIs, distribución, conductor e hipótesis
dígito a dígito; verificado ejecutando `nucleo/` contra el fixture). Lo perdido era CONTEXTO
OPERATIVO (popup pobre, observaciones de calidad, tramos invisibles en el mapa, Fundamentos/
Cantidades/Falla apagadas) y lo ganado es real: cartografía autohospedada, modelo de empalmes
corregido, honestidad técnica superior al original.

### Decisión (Ola 1 — ejecutada)

1. **`@lineas/exportar` como workspace hermano de `nucleo/`** (manda ADR-005): la versión del
   paquete viaja dentro de cada archivo. CSV en DOS dialectos (Excel es-CO con coma decimal — el
   original entregaba punto y Excel lo leía como texto — y RFC 4180). Procedencia dentro de los 3
   formatos. GPX con bounds/jornadas/tipo por punto; KML con Schema+ExtendedData (QGIS recibe
   atributos).
2. **Resumen premium:** popup con la ficha completa del original desde la MISMA derivación que los
   exportes; trazado coloreado por tramo de tensión con leyenda; panel **Calidad del levantamiento
   CALCULADO** (el original lo tenía redactado a mano). El quiebre de E06 es 118,2° sobre
   estructuras (los 119,3° del original metían empalmes en el ángulo).
3. **Fundamentos completa:** 9 tarjetas como DATO público + MathML nativo + valores vivos del
   núcleo con procedencia + marco normativo. El tope «50 % RTS» se presenta como criterio clásico
   PENDIENTE de cierre (RETIE fija 25 % sin carga, TODO-11); la contradicción de resoluciones
   RETIE del original queda visible como pendiente.
4. **Transversal:** sesión visible + Salir · ARIA de pestañas · impresión · contraste · favicon/
   manifiesto · sello motor+hipótesis en las tablas · Fichas con inventario del contrato y huecos
   DECLARADOS («pendiente — F4») · Firestore fuera del arranque (−660 kB para quien no entra) ·
   `FUNCIONES_ANCLA` como único dueño del corte (fuera las regex del mapa y de Fichas).

### Alternativas descartadas

- Replicar el original tal cual (reintroduce el error de empalmes y el CSV ilegible en Excel).
- Resolver en silencio las contradicciones del original (50 %/25 %, resoluciones RETIE, 90/75 °C
  en ampacidad): se DECLARAN, no se maquillan.
- Ejecutar todo el backlog de una vez: la Ola 2 exige decisiones de contrato (BOM, EventoFalla) y
  datos que aún no existen (cota de sujeción para gálibo) — va con su propio análisis.

### Consecuencias

78 pruebas (14+3 nuevas golden de exportes y calidad) · producción desplegada · verificación visual
con arnés de datos sintéticos (la verificación con sesión real queda en el Ingeniero, `30 · L-17`).

### Crudo de respaldo

`../brain-private/mantenimiento-lineas-at/research-archive/2026-07-30-auditoria-original-vs-web-7-dimensiones.json`
(250 KB: las 7 dimensiones con evidencia archivo:línea de ambos lados).

---

## ADR-008 · 2026-07-31 · Décima colección `investigaciones`: el expediente de falla es un tipo de documento propio

**Estado:** ✅ Implementado (contrato + reglas desplegadas + pestaña Falla viva con el evento real de la E02).

### Contexto

El Ingeniero señaló que **no se apreciaba el evento de la E02** en la web. Era cierto y era peor de
lo que parecía: la aplicación no tenía nada del evento — ni marcador en el mapa, ni pestaña (estaba
deshabilitada). El módulo original sí lo tenía: un objeto `FALLA` con cronología, observaciones,
hipótesis jerarquizadas y verificaciones pendientes, más un marcador `⚠` sobre el mapa.

`contratos/` declaraba **«nueve tipos de documento, ni uno más en v1»**. Había que decidir si el
expediente cabía en los nueve o si el número sube a diez.

### Decisión

> **Sube a diez.** Un expediente de falla NO cabe en `hallazgos` sin borrar la distinción que lo
> hace defendible: **lo que se VE** (observaciones sobre la evidencia física) frente a **lo que se
> CONCLUYE** (hipótesis con verosimilitud declarada). Un hallazgo es un defecto observado en un
> apoyo; una investigación es un razonamiento fechado sobre un evento, con grados de certeza.

El tope de nueve era un guardarraíl contra la proliferación, no un dogma: se sube **declarándolo**
en el propio `COLECCIONES` con su justificación, no colándolo en silencio.

### Consecuencias

- **El dato real vive en la bóveda** (`fixtures/LN-627-falla.json`), jamás en el repositorio
  público. `sembrar.mjs` lo carga si está y lo dice si no; no inventa un evento.
- **Enlace por `apoyoId` inmutable**, nunca por número de estructura: renumerar la línea no puede
  mover el evento a otro apoyo (regla de identidad de `CLAUDE.md §3.1`).
- **Las reglas de Firestore funcionaron como se prometió:** la lectura falló con *«Missing or
  insufficient permissions»* hasta que se añadió la regla, porque el `match /{document=**}` final
  niega todo lo no declarado. Quedó demostrado en producción que *«añadir una colección exige
  añadir su regla»* no es un comentario decorativo. El cliente solo LEE lo de su organización;
  un expediente `cerrada: true` ya no se actualiza, y no se borra nunca.
- **La lectura es defensiva:** va en su propio `try/catch`. Un fallo leyendo expedientes no puede
  tumbar la vista de la línea — el cálculo mecánico no depende de ellos (fue justo lo que pasó
  entre el despliegue del código y el de las reglas, y la línea siguió viéndose).
- Camino doble para enterarse del evento: marcador que late en el mapa **y** aviso en el Resumen.
  El mapa no puede ser el único camino: se descarga aparte y puede fallar.

### Crudo de respaldo

El objeto `FALLA` del módulo de campo v11 (idéntico byte a byte al v10, verificado por SHA-256),
extraído a la bóveda. Evidencia de funcionamiento: `docs/30 · L-22`.

---

## ADR-009 · 2026-07-31 · Inventario de brechas y primera tanda de cierre (P0)

**Estado:** ✅ Inventario cerrado (8 auditores) · ✅ 5 módulos construidos y desplegados ·
⏳ 2 decisiones abiertas del Ingeniero.

### Contexto

El Ingeniero señaló que «aún no está toda la información condensada que existe en el html ni los
mismos criterios», con dos ejemplos: los diagramas y el paso a paso de Fundamentos, y las fotos y
descripciones de Falla. Se auditó segmento por segmento contra el paquete PUBLICADO.

**Paridad medida:** Falla 10 % · Cantidades 15 % · Fichas 25 % · Fundamentos 30 % · Mecánico 30 % ·
Exportar 40 % · Criterios 45 % · Resumen 72 %. **79 faltantes, 31 de prioridad P0.**

### Decisión

> Cerrar primero lo que **no depende de nadie más**: cinco módulos PUROS nuevos, construidos en
> paralelo por cinco agentes con los archivos particionados para que no colisionaran, e integrados
> a mano. Lo bloqueado por datos o por decisiones se declara, no se rellena.

`web/src/vistas/diagramas.ts` (9 figuras, cinco alimentadas con datos reales de la línea) ·
`nucleo/umbrales.js` (8 indicadores con semáforo y fuente) · `nucleo/vanos.js` (detalle vano a vano
y control catenaria-vs-parábola) · `nucleo/cantidades.js` (BOM geométrico) ·
`nucleo/coherencia.js` (función declarada contra deflexión medida, fuga específica, puesta a tierra).

### Consecuencias verificadas en producción

- Los 9 diagramas se dibujan con los datos de la línea: la catenaria con su vano de 336,7 m y su
  flecha de 9,23 m; la vista en planta con la deflexión real de 118,1°.
- El control catenaria-vs-parábola da **error −0,100 %** en el vano peor: por debajo del 0,5 %
  adoptado, o sea que la simplificación parabólica **es admisible en esta línea** — y ahora está
  demostrado con su número, que es lo que pide un revisor externo.
- **14 de 23 vanos caen fuera de la banda 0,7–1,3 respecto al VIR de su tramo.** Es un hallazgo
  real y nuevo: donde más pesa es el tramo 4, con 14 vanos. La hipótesis del VIR pierde validez
  ahí y el tramo debería subdividirse. No estaba visible antes.
- Ningún estado del semáforo se llama «incumple»: el sistema señala, dictamina quien firma.

### Lo que queda abierto (decisión del Ingeniero, no del código)

1. **Almacenamiento de las 103 fotos** (18 MB, ya extraídas a la bóveda). Cloudflare R2 sobra
   —10 GB gratis, egreso gratis— pero está SIN HABILITAR: la API responde *«Please enable R2
   through the Cloudflare Dashboard»*. Sin eso, la galería del expediente y el informe fotográfico
   no se pueden construir. Firebase Storage sigue descartado (exige plan de pago, ADR-001).
2. **El tope de tiro: 50 % clásico o 25 % del RETIE sin carga externa.** El umbral salió del código
   a las hipótesis (`tiroAdmisible_pct`) y la tabla muestra AMBOS criterios; el segundo queda en
   «no evaluable» hasta que se declare cuál rige. **Los números no cambiaron.**

### Crudo de respaldo

`../brain-private/mantenimiento-lineas-at/research-archive/2026-07-31-brecha-original-vs-web-8-segmentos.json`

---

## ADR-010 · 2026-08-01 · Cómo se sirven las fotos: un portero delante del almacenamiento

**Estado:** ✅ **EN PRODUCCIÓN desde el 2026-08-03.** El Ingeniero completó el alta de R2 ($0/mes,
10 GB gratis) y se desplegó todo: depósito `lineas-at-evidencias` (privado), portero en
`lineas-at-evidencias.ajimenezp99.workers.dev`, 4 fotos del expediente de LN-627 servidas y
verificadas en pantalla.

**La prueba de seguridad, hecha contra la URL real:** sin token → 401 · token basura → 401 · JWT
bien formado con FIRMA FALSA → 401 *«la llave del token no está entre las de Google»* · objeto
inexistente → 401 **antes** de mirar si existe, para que nadie enumere qué fotos hay tanteando
rutas. El portero no se conforma con que el token parezca un token.

### Contexto

Las 103 fotos del expediente (18 MB) no pueden ir en el repositorio —es público— ni dentro de un
documento de Firestore (límite de 1 MiB, y el guardarraíl de ADR-002 lo prohíbe). Van a
almacenamiento de objetos. Pero **subirlas es fácil y SERVIRLAS no**: el depósito nace privado y la
aplicación no tiene servidor que firme una URL temporal ni valide la sesión.

### Alternativas y por qué se descartaron

| Descartada | Motivo |
|---|---|
| **Depósito público** (`r2.dev`) | Trivial y gratis, y deja las fotos de infraestructura de un cliente accesibles en internet para cualquiera con el enlace. Rompe la regla nº 1 del proyecto. |
| **Dejar las fotos fuera de la web** | Es lo que había. El expediente sin evidencia fotográfica es justo lo que el Ingeniero señaló que faltaba. |
| **URL firmadas desde el cliente** | Exigiría la llave del depósito en el navegador: la llave sería pública de facto. |

### Decisión

> **Un trabajador (Worker) en `evidencias/` delante del depósito.** Verifica la FIRMA del token de
> Firebase contra las llaves públicas de Google —no se fía de que el token "tenga pinta" de token—,
> comprueba proyecto, emisor, caducidad y la organización del token, y solo entonces entrega el
> objeto. No escribe, no borra, no lista.

Se sirve con `cache-control: private`: son datos de cliente, y ninguna caché intermedia debe quedarse
una copia.

### Consecuencias

- **Adelanta cómputo en servidor**, que ADR-001 aplazaba hasta F5. Se acepta a conciencia: es la
  única alternativa que no expone material de cliente. El trabajador se apaga solo si no se usa y
  cabe de sobra en el plan gratuito.
- **R2 no APAGA, COBRA** — 0,015 USD/GB extra. Choca con *«se prefiere el servicio que apaga al que
  cobra»* (`05`). Con 18 MB contra 10 GB gratis el margen es de 500×, pero queda declarado.
- El alta de R2 exige **aceptar términos y registrar tarjeta** en el panel. Lo hizo el Ingeniero:
  Claude no introduce datos de pago en ningún formulario, ni con autorización.
- La galería degrada con honestidad: sin portero desplegado o sin sesión, dice qué falta en vez de
  dejar cuadros rotos.

### Pendiente

Desplegar el trabajador y sembrar las fichas, en cuanto R2 responda. Comandos en
`herramientas/subir-evidencias.mjs`.

---

## ADR-011 · 2026-08-01 · La carga sobre la estructura: pestaña propia, y el contrato que le faltaba

**Estado:** ✅ Construido, probado y **en producción** (verificado contra el sitio, no en local).

### Contexto

`nucleo/cargas.js` estaba escrito, comentado y probado desde la tanda de ADR-009 — y **ninguna vista
lo llamaba**. El sistema sabía decir cuánto TIRA el conductor (pestaña Mecánico) y cuánto lo empuja
el aire (pestaña Viento): las dos hablan del cable. La pregunta de la que responde quien firma un
mantenimiento es otra —**¿y el apoyo aguanta?**— y no salía por ninguna pantalla.

El dato escondido era el **factor del quiebre**, `2·sen(α/2)`: vale 0 en recta, 1 exacto a 60° y
1,73 a 120°. En LN-627 hay tres estructuras por encima de 60°, y una (E06, 118,2°) recibe un **72 %
más** de carga transversal que la propia tensión del conductor — siempre, haya viento o no. Un apoyo
así, dimensionado «por el tiro», está dimensionado por poco más de la mitad.

### Alternativas y por qué se descartaron

| Descartada | Motivo |
|---|---|
| **Meterlo dentro de Mecánico** | Mecánico habla del CONDUCTOR (tramos, tiros, flechas). La carga habla de la ESTRUCTURA. Mezclarlas obliga al lector a separar dos preguntas distintas en la misma tabla, y Mecánico ya arrastra cuatro secciones. |
| **Estimar la capacidad del apoyo** para poder dar un veredicto | Es el error que este sistema no puede cometer. Un apoyo que "cumple" contra una rotura supuesta es un informe firmado sobre una suposición. Se declara `no evaluable`, que es un hecho sobre los datos. |
| **Deducir la altura libre de `altura_m`** | El empotramiento depende del terreno y no se ve desde un escritorio. |

### Decisión

> **Pestaña «Cargas», la undécima, después de Viento** —porque compone con el empuje que aquélla
> caracteriza— con su capa pura `web/src/vistas/cargasDatos.ts` (36 pruebas) y su componente. Ni una
> fórmula fuera del núcleo.
>
> **Contrato a v0.2.0** (cambio MENOR: solo campos opcionales): `Apoyo.alturaLibre_m` y
> `Apoyo.alturaAplicacion_m`. Eran los dos datos que le faltaban a `utilizacionApoyo()` — sin ellos
> la pregunta «cuánto le queda» era código inalcanzable para siempre.

La pantalla declara con esas palabras lo que NO hace: no dimensiona apoyos, no evalúa carga vertical
(vano peso) ni longitudinal, y no cubre los dos apoyos extremos, cuyo caso de carga dominante es
otro.

### Consecuencias

- **Hallazgo de ingeniería nuevo y real:** tres estructuras (E02, E06, E20) amplifican la tensión.
  Es material para la nota técnica de LN-627 y para la conversación con AFINIA.
- **El hueco que queda es de CAPTURA, no de desarrollo:** 22 apoyos tienen su carga calculada y
  ninguno su capacidad declarada. En cuanto el inventario traiga rotura y las dos alturas, la tabla
  pasa de «cuánto empuja» a «cuánto le queda», sin tocar código.
- **Deuda que se hereda:** el desequilibrio longitudinal entre tramos contiguos aparece declarado en
  cinco apoyos (los que anclan tramos con tiros distintos) y sigue sin evaluarse.

**Cerrado el 2026-08-01 (TODO-39): sale del edificio.** La carga ya no vive solo en pantalla — entra
como cuarta sección del CSV de verificación mecánica (19 columnas, con `Factor_quiebre` a la vista
para poder ordenar la hoja por él) y como sección 6 del informe imprimible, entre los vanos y los
umbrales. Y sube a «Lo que este informe NO demuestra», que es la que se lee al firmar: los apoyos sin
capacidad declarada, los extremos sin verificar y —siempre— que solo se evaluó el eje TRANSVERSAL.
Verificado interceptando los archivos que genera PRODUCCIÓN: 24 filas en los dos, sin `NaN`, y el
informe sigue sin un solo `<script>` ni recurso externo.

### Crudo de respaldo

— (implementación directa sobre `nucleo/cargas.js`, que ya traía su propia deliberación en el crudo
de ADR-009). Evidencia reproducible: `tests/cargas-vista.test.js`.

---

## ADR-012 · 2026-08-01 · El eje longitudinal: cerrar la deuda que `cargas.js` declaraba

**Estado:** ✅ Construido, probado y **en producción**. Diseñado con workflow de 7 agentes Opus
(3 diseñan · 3 refutan con lentes distintas · 1 sintetiza) y con sus afirmaciones empíricas
**verificadas a mano contra el motor** antes de escribir código.

### Contexto

`nucleo/cargas.js` decía en su cabecera, con esas palabras, que NO evalúa la carga longitudinal:
terminales, rotura de conductor y desequilibrio de tiros entre tramos contiguos. Esa deuda dejaba
sin cubrir el eje del que cuelga la retención — y el que gobierna por completo un apoyo terminal.

### Lo que la verificación previa cambió del diseño

Tres hechos medidos con el motor real, ninguno obvio, y los tres habrían sido el bug natural:

| Hecho verificado | Qué habría pasado sin verificarlo |
|---|---|
| El mayor desequilibrio ocurre a **T MÁXIMA**, no en el estado de mayor tiro (que es T mín) | `cargas.js` toma `maximo`; imitarlo daba el número equivocado en toda la línea |
| **El sentido se invierte** entre estados (+894 a T máx, −444 a T mín en la misma frontera) | Publicar `|ΔH|` borra el dato que decide si hace falta retención a UN lado o a los DOS |
| ΔH en el estado EDS es **cero exacto** en todas las fronteras | Se leería como «no hay desequilibrio» cuando es un cero del MODELO (un solo `eds_pct` por línea) |
| Un tramo de vano ideal corto cae al 12 % de su EDS a T máx y **domina** la tabla | Un hueco que entra por un número CALCULADO pasa la guardia de los `null` sin avisar |

### Decisión

> **`nucleo/longitudinal.js`**, hermano de `cargas.js`: mismo ángulo, dos ejes —
> `cos(α/2)` frente a `2·sen(α/2)`— y **nunca una suma entre ellos**.
>
> Se construyen cuatro casos: terminal (tiro entero), desequilibrio en anclaje
> `(H₂−H₁)·cos(α/2)`, rotura de conductor en anclaje (magnitud **y** sus dos componentes) y el
> cero declarado de la suspensión. La envolvente es **POR SENTIDO**, nunca por magnitud.
>
> Cada fila lleva `sensibilidadTendido_kgf` —lo que pesaría una diferencia de tendido de obra del
> 1 % de la rotura— y dos banderas separadas: `sentidoResoluble` (¿el sentido dominante supera ese
> ruido?) e `inversionResoluble` (¿lo superan **los dos**?). Solo con la segunda se afirma que un
> apoyo tira hacia ambos lados.

### Alternativas y por qué se descartaron

| Descartada | Motivo |
|---|---|
| Reusar la forma aplanada de la vista (`hEds`/`hTMax`/…), como hace `cargas.js` | No trae temperatura ni carga unitaria, así que no permite comprobar que los dos lados sean comparables. Restar sin comprobarlo da un desequilibrio que puede ser varias veces el real, con unidades correctas. |
| Emparejar los estados por su NOMBRE | Los cuatro nombres son literales fijos de `estadosDelTramo`: salen idénticos con cualquier hipótesis y cualquier conductor, así que comparar nombres no comprueba nada. Se compara la TERNA (clave, temperatura, carga unitaria). |
| Resolver el terminal como un desequilibrio contra cero | Un tramo que no se pudo calcular también valdría 0 y se leería como terminal, devolviendo la carga máxima posible del apoyo como si fuera un hecho. Función aparte. |
| Estimar `kRes` en apoyos de suspensión («el 0,5 típico») | Convertiría 17 filas honestamente vacías en 17 números que nadie puede defender. |
| Usar `cargaRotura_kgf` como capacidad longitudinal | Es ensayo TRANSVERSAL en punta; su validez en este eje depende de la sección del apoyo y de si hay retenida, y ninguna está declarada. |

### Consecuencias

- **Hallazgo real:** los apoyos terminales soportan el tiro entero (2.339 kgf por conductor en
  LN-627), que es un orden por encima de cualquier desequilibrio de la línea.
- **Deuda que se hereda:** ningún apoyo tiene veredicto en este eje. Exige un campo nuevo,
  `capacidadLongitudinal {valor_kgf, tipo, alturaReferencia_m, fuente}`, que **no** se añadió: es
  alta de contrato y se propone, no se decide desde aquí.
- Sale al informe (sección 7) y al CSV (quinta sección), con la advertencia explícita de que los
  dos ejes **no se suman**.

### Crudo de respaldo

`research-archive/2026-08-01-workflow-eje-longitudinal.json` · evidencia reproducible:
`tests/longitudinal.test.js` (52 pruebas).

---

## ADR-013 · 2026-08-03 · Auditoría adversarial de la ola 4: lo que 564 pruebas en verde no veían

**Estado:** ✅ Nueve hallazgos arreglados y en producción · ✅ los once menores, cerrados en `ADR-014`.

### Contexto

En una sola jornada entraron dos módulos de ingeniería nuevos (los dos ejes de carga), su salida al
informe y a los exportes, la ficha ampliada y —lo más serio— el portero de fotos **sirviendo
material real de cliente por primera vez**. La suite pasaba 555/555. Se lanzó un workflow de 7
agentes Opus con cuatro lentes adversariales (eje longitudinal · coherencia entre pantallas ·
entregables · seguridad) y dos de investigación.

### Lo que apareció, y que la suite verde no veía

| Hallazgo | Por qué las pruebas no lo cazaban |
|---|---|
| El portero fallaba **ABIERTO**: `if (ORG_PERMITIDA && ...)` — sin la variable, cualquier sesión del proyecto bajaba fotos de cliente | Ninguna prueba ejerce el módulo sin su configuración |
| `ANCLAN` omitía `'Derivación'`: un apoyo de derivación publicaba **cero** carga longitudinal (eran ~560 kgf) con una nota físicamente falsa | La lista estaba mal desde el primer commit y **no tenía guardián** |
| Un anclaje sin ángulo publicaba *«el mayor desequilibrio calculado (0,0 kgf)»* | El guardián contaba INTENTOS (`porEstado.length`), no resultados |
| La rotura tomaba el pico del tramo **roto** en vez del **sano**: −32 %, lado inseguro | El fixture hacía picar los dos tramos en el mismo estado |
| Un nombre de apoyo repetido volteaba magnitud **y lado** | `find()` devuelve el primero; ninguna prueba usaba nombres duplicados |
| El informe cerraba con «todos los vanos dentro de la banda» contando solo los `=== true` | El tercer estado (`null`) no tenía prueba |

### Decisión

> **Lo que no se puede calcular se DECLARA — y eso incluye la configuración.** El portero pasa a
> fallar CERRADO: sin `ORG_PERMITIDA` o `PROYECTO_FIREBASE` devuelve 503 y no sirve nada. Una
> seguridad que depende de que un valor ESTÉ no es seguridad.
>
> **Toda lista de dominio duplicada lleva su guardián** (`L-19`), sin excepción. `ANCLAN` era la
> única de las tres sin él, y por eso fue la única que divergió.
>
> **Los guardianes se ponen sobre RESULTADOS, no sobre intentos.** Contar entradas de un array cuyo
> contenido puede ser `null` es no contar nada.

### Consecuencias

- Nueve arreglos en producción, cada uno con su prueba de regresión (564 pruebas, +9).
- Se endurecieron las reglas de Firestore y se desplegaron, verificando que la línea sigue cargando:
  endurecer y dejar fuera al dueño habría sido peor que el agujero.
- **Lo que esto enseña del método:** las 555 pruebas eran verdes y correctas; medían lo que yo pensé
  medir. Lo que faltaba era una lente ajena buscando lo que yo NO pensé. Escribir la prueba y
  auditar el resultado son dos trabajos distintos, y el segundo no se puede hacer solo.

### Crudo de respaldo

`research-archive/2026-08-03-auditoria-ola-4.json` (20 hallazgos, 5 descartados con motivo).

---

## ADR-014 · 2026-08-03 · Cerrar los once menores de la auditoría: dueños únicos y frases verdaderas

**Estado:** ✅ Cerrado · `TODO-45` completo · 597 pruebas en verde (+24)

### Contexto

`ADR-013` dejó nueve hallazgos arreglados y once menores en `TODO-45`. «Menor» era la gravedad del
número, no la del daño: ninguno de los once inventaba una cifra, pero **cinco de ellos hacían que el
informe firmable afirmara algo que el propio sistema desmentía dos páginas después**, y ese es
exactamente el tipo de contradicción que se descubre delante del cliente. Los once se reprodujeron
en el código antes de tocar nada (§3.2); uno —la caché de las fotos sin `Vary: Authorization`— ya
estaba arreglado en `0a44024` y el crudo lo listaba pendiente por error.

### Lo que apareció al arreglarlos, y que no estaba en el encargo

| Hallazgo | Lo que había DEBAJO |
|---|---|
| La deflexión tenía **dos políticas opuestas**, las dos documentadas como la correcta | Nadie era el dueño: el núcleo prefería el ángulo guardado, el levantamiento y la ficha lo recalculaban |
| El informe atribuía el tope de tiro «a la hipótesis» | El campo `tiroAdmisible_pct` **no existía en el contrato**: la rama «declarada» de `umbrales.js` era inalcanzable y el tope valía 50 % pasara lo que pasara |
| El CSV no neutralizaba `= + - @` | La regla de escritura estaba **copiada en tres exportadores**: arreglarla en uno la dejaba abierta en los otros dos |
| La celda «Sentido» afirmaba «los dos» donde el núcleo se niega | El cálculo y el KPI ya se habían corregido; quedó la celda vieja, y esa celda decide si hace falta retenida a uno o a los dos lados |

### Decisión

> **Un dato con dos dueños no tiene dueño.** La deflexión la resuelve `geodesia.resolverDeflexion`,
> y manda la GEOMETRÍA — el `deflexion_grados` guardado existe para AUDITAR lo que se calculó aquel
> día (así lo dice el contrato), no para pintar hoy. Si la geometría no puede resolverlo se usa el
> guardado, pero la fila lo DECLARA; y si los dos existen y discrepan más de 0,5°, también.

> **Y sí movió números en LN-627 — tres, y los tres estaban mal.** Verificado contra producción con
> el navegador del Ingeniero: `E05 4,3° → 3,5°`, **`E06 119,3° → 118,2°`** y `E07 1,0° → 0,0°`. Son
> exactamente los tres apoyos que rodean el empalme «EMP TUB»: el ángulo guardado lo había calculado
> el módulo original contando el empalme como un vértice de la línea, y un empalme no dobla nada —
> cuelga a mitad de vano. La consecuencia visible: **E06, el apoyo que más amplifica la tensión de
> toda la línea, pasa de ×1,726 a ×1,716** (73 % → 72 % más carga transversal). Ninguna función
> estructural cambia. El `99 §ADR-006` ya había cazado este mismo error en el exporte del
> levantamiento y lo dejó escrito; lo que faltaba era que el MOTOR dejara de consumir el valor
> contaminado. Y desde hoy la pantalla lo declara sola: la nota de discrepancia sale en esos tres
> apoyos, con los dos ángulos y con qué corregir si el bueno fuera el otro.
>
> **Aviso de método, para no repetirlo:** la primera comprobación dio «no mueve ningún número», y era
> falsa — el filtro de empalmes del script miraba un campo `tipo` que el fixture de la bóveda no
> tiene, así que no filtró nada y comparó el valor guardado contra sí mismo. Un filtro que no casa
> con nada no falla: devuelve todo y parece que confirma (`L-32`, misma familia).

> **Una frase del informe firmable se DERIVA de su dueño, no se escribe a mano.** El tope de tiro
> sale del indicador de `evaluarUmbrales` (que ahora publica `procedenciaUmbral` como campo, no
> dentro de un párrafo); el criterio de utilización y su umbral se importan del núcleo y se imprimen
> al pie de la tabla y en la cabecera de la sección del CSV. Un semáforo sin fuente es una opinión
> con colores, y eso lo dice el propio informe en su sección 8.

> **`tiroAdmisible_pct` y `criterioTiroQueRige` entran al contrato — y eso NO decide `TODO-33`.**
> Son opcionales y aditivos. Hasta que el Ingeniero declare cuál rige, el sistema sigue mostrando
> los dos criterios y sin elegir. Lo que se arregla es que su decisión ya tiene dónde entrar.

> **En seguridad, una barrera imaginaria es peor que ninguna.** Se corrigieron tres afirmaciones
> falsas: CORS no rechaza por `Origin`, el binding de R2 no es de solo lectura, y con token válido
> el portero SÍ revela si un objeto existe. Esa última se sostiene hoy sobre un invariante que ahora
> está escrito: **un depósito, una organización**. `PREFIJO_EVIDENCIAS` queda listo para el día que
> deje de ser cierto, apagado y declarado como apagado.

### Consecuencias

- **+24 pruebas** (573 → 597), entre ellas las primeras del **portero**, que estaba en producción
  sirviendo material de cliente sin una sola. Cubren lo que decide antes de la firma: configuración
  ausente, método, ruta, clave mal codificada y falta de token.
- `exportar/dialecto.js` nace como dueño único de cómo se escribe una celda; `mecanica.js` lo
  re-exporta para no romper a quien lo importaba (cambios aditivos, `CLAUDE.md §3.1`).
- La pantalla de Cargas publica por fin las notas por fila del eje longitudinal, que solo llegaban
  al CSV — incluido el aviso del piso de validez, que el núcleo llama «el mismo fallo que un hueco
  convertido en cero, pero que entra por un número calculado».
- **Deuda que este ADR deja escrita:** el nodo `30` quedó a 385 líneas de 350. `L-34` entró
  destilada al límite; la próxima lección **no cabe** sin el shard de `TODO-46`.

### Crudo de respaldo

`research-archive/2026-08-03-auditoria-ola-4.json` — mismos veinte hallazgos; éste cierra los once
que `ADR-013` dejó abiertos.
