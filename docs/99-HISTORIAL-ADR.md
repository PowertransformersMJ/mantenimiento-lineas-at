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
