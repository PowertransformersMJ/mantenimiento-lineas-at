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
dependencia de dos servidores de teselas cuyos términos no permiten este uso. → `31 · L-10`.

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

> ⚠️ **ENMIENDA 2026-08-04 (`§ADR-019`).** De esas cinco medidas «del día 1», al 04-08 solo una está
> puesta: el **rol en *claim*** (`herramientas/usuarios.mjs` + `firestore.rules`). **App Check NO
> existe** y la allowlist de dominio tampoco; las funciones `onCall` no aplican todavía porque el
> subsistema de IA no está construido. No es que se decidiera otra cosa: es deuda, y está declarada
> como bandera roja en `05` y como fase 4 de `TODO-50`. Lo que sí cambió por decisión es el ingreso:
> hoy hay **contraseña y cero registro público**, que `ADR-001` y `ADR-002` aún describen de otra
> forma porque son anteriores.

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
extraído a la bóveda. Evidencia de funcionamiento: `docs/31 · L-22`.

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

---

## ADR-015 · 2026-08-03 · Una foto puede colgar de un APOYO, y el número del archivo no es el del apoyo

**Estado:** ✅ Cerrado · `TODO-43` completo · 99 fotos en producción, repartidas y verificadas

### Contexto

Las 99 fotografías de estructura de LN-627 llevaban desde el principio en la bóveda, sin poder
subirse. El plan de la auditoría (`ADR-013`) las declaró **no viables** por dos razones distintas:
una regla de asignación que no es la que parece, y un contrato que las rechazaba.

### La trampa: `e07` NO es `E07`

El número del nombre del archivo es el número de **PUNTO del levantamiento**, y ahí dentro van
también los empalmes. En LN-627 hay empalmes en los puntos 6 y 8, así que a partir de ahí todo se
corre dos posiciones:

| archivo | punto | qué es de verdad |
|---|---|---|
| `e06-*` | 6 | **EMPALME E05-E06** (2 fotos) |
| `e07-*` | 7 | **estructura E06** (9 fotos) |
| `e08-*` | 8 | **EMPALME E06-E07** (3 fotos) |
| `e09-*`…`e14-*` | 9-14 | E07 … E12, todo corrido |

Leer «`e07` = E07» habría desplazado **9 de los 14 grupos — 54 de las 99 fotos** a un apoyo
equivocado. Sería creíble, estaría mal, y no lo notaría nadie hasta que alguien fuera al sitio.

**Verificado contra la fuente, no contra el índice.** El `indice.json` de la bóveda NO prueba nada:
sus campos `estructuraPunto` y `orden` son exactamente los dos números del nombre del archivo — es
circular. La prueba está en el HTML del módulo de campo: su lista `BASE` pone `627 EMP TUB` en n=6
y `627 E06` en n=7, y su mapa `FOTOS` tiene 8, 20, 7, 7, 3, 2, 9, 3, 7, 8, 7, 9, 5 y 4 fotos por
clave — idéntico, grupo a grupo, a los archivos de la bóveda.

### Decisión

> **`apoyoId` basta por sí solo para que una fotografía sea evidencia.** El contrato exigía
> inspección o investigación; estas fotos no son ninguna de las dos, son el recorrido de
> levantamiento. La alternativa —crear la Inspección y colgarlas de ella— era más fiel al dominio y
> se descartó porque **obligaba a inventar datos**: la cuadrilla y los apoyos cubiertos no existen
> en ninguna parte, y «tener fotos» no es «haberse inspeccionado». Una foto amarrada a UNA
> estructura y a la fecha en que se tomó ya prueba lo que tiene que probar.

> **La asignación se IMPRIME antes de subir un solo byte, y es todo o nada.** El subidor resuelve
> cada archivo LEYENDO el documento del apoyo en la base (`orden === n−1`) y usando SU id —nunca
> re-derivándolo con la fórmula del sembrador, que el día que cambie de semilla apuntaría a
> documentos inexistentes sin un solo error—. Si un archivo no resuelve, no se sube ninguno: la
> mitad bien colgada y la otra mitad en el limbo es peor que ninguna.

> **Las 5 fotos de los dos empalmes se publican en la ficha del EMPALME**, que tiene su propio UUID.
> Colgarlas de la estructura vecina «para no perderlas» sería inventar procedencia. Por eso la
> galería de la ficha NO está condicionada a que el punto sea estructura.

> **Los pies se dejan como vienen** («IMG_3394 · 10:06:19»): no son descripciones, pero no afirman
> nada falso y son la trazabilidad con el archivo original. Redactar qué muestra una foto es un
> juicio de ingeniería, y `ADR-004` prohíbe que el modelo opine sobre evidencia.

### Consecuencias

- 99 fotos en R2 (**17 MB**, total del depósito ~35 MB de 10 GB gratis) y 99 fichas en la base.
  Verificado en producción: E06 muestra sus 9, el empalme E05-E06 sus 2, y E13-E24 declaran que no
  tienen ninguna. Reparto comprobado contra la base, punto por punto.
- El contrato pasa a admitir tres dueños posibles, con **prueba de guardián** (`tests/contrato-
  evidencia.test.js`): estrechar ese `refine` haría desaparecer fotos ya pagadas **en silencio**,
  porque la aplicación descarta con `safeParse` lo que no valida y no lo dice en pantalla.
- Se cerró un fallo latente: la lectura de evidencias estaba condicionada a que la línea tuviera
  expediente de falla. Funcionaba por casualidad —LN-627 tiene uno— y la segunda línea con fotos y
  sin falla habría mostrado cero, sin error.
- **Deuda declarada:** el subidor lanza `wrangler` una vez por archivo, en serie. Si falla en la 98
  quedan objetos huérfanos en R2 (reintentar es seguro: la clave lleva la huella). Y la única
  prueba de que `e07` es E06 vive en un HTML de 30 MB **sin respaldo remoto** (`TODO-34`): si ese
  archivo se pierde, la asignación deja de ser reproducible.

### Crudo de respaldo

`research-archive/2026-08-03-auditoria-ola-4.json` → `plan43` (12 pasos, 9 riesgos, 7 huecos).

---

## ADR-016 · 2026-08-03 · Partir el nodo de lecciones en una madre-índice y tres hijos por tema

**Estado:** ✅ Cerrado · `TODO-46` completo · 33 lecciones, ninguna perdida ni alterada

### Contexto

`ADR-014` dejó escrita la deuda: el nodo `30` quedó a 385 líneas de un tope de 350, y el tope DURO
del linter está en 385. **La lección siguiente no cabía**, y una lección que no cabe pone
`brain:check` en rojo, que bloquea el commit por hook. El nodo llevaba meses creciendo y su propia
salida ya lo pedía: *«leve exceso — destilar»*.

Se abordó con un workflow de **10 agentes Opus** (2 propuestas de reparto con lentes opuestas + 1
juez + 3 constructores + 1 registrador + 3 auditores adversariales), acotado como manda el
Ingeniero. Antes de lanzarlo se guardó una copia exacta del nodo con el **hash de cada lección**,
para poder demostrar después que no se perdió ni se deformó ninguna.

### La decisión de reparto, y por qué esa y no la otra

Compitieron dos criterios. **Por SÍNTOMA** (agrupar por lo que está viviendo quien busca ayuda) y
**por SUBSISTEMA** (agrupar por qué pieza falló). Ganó el segundo, y el argumento que lo decidió es
comprobable: **el nodo no se consulta solo cuando algo se rompe.** Su propia cabecera dice que se
consulta *«antes de una operación riesgosa»*, y el índice lo enruta con dos preguntas, no una. Al
ir a dar de alta un servicio o a tocar el motor **todavía no hay síntoma** que mirar — pero la
pieza que estás tocando la sabes siempre. La lente del síntoma solo servía a la mitad del tráfico.

> **Madre `30`** — índice de las 33 + las **7 de MÉTODO** completas (deliberar, verificar, cerrar).
> Se quedan porque no son de ninguna pieza: valen para las tres y son las más citadas.
> **`31-LECCIONES-PROVEEDORES`** — lo que depende de un tercero: su factura, su licencia o su SDK.
> **`32-LECCIONES-PANTALLA`** — lo que se VE o se ABRE no es lo que el núcleo produjo (incluido el
> CSV que Excel abre mal: un archivo entregado también es «lo que el usuario ve»).
> **`33-LECCIONES-NUCLEO-Y-DATO`** — el número que se firma y el dato que no puede salir del repo.

### Las dos reglas que hicieron esto seguro

> **Los `L-NN` NO se renumeran, jamás.** Los cita `CLAUDE.md`, la pizarra, el `20`, el `99` **y los
> comentarios del código fuente** — y el código el linter no lo mira. Se mueven los cuerpos; los
> números se quedan quietos. El nombre de los hijos tampoco es libre: el kernel los descubre por el
> patrón `3[1-9]-LECCIONES*.md` (gate 5, desde v1.7). Con otro nombre, cada lección movida se
> convierte en referencia colgante.

> **Los cuerpos se mueven VERBATIM y se demuestra con hashes.** Ni una palabra reescrita, ni una
> ortografía «mejorada». Verificado por dos vías independientes: los tres auditores del workflow y
> un diff propio hash a hash contra la copia previa. Resultado: **33 antes, 33 después, ninguna
> ausente, ninguna duplicada, ninguna alterada.**

### Lo que los auditores cazaron, y que el linter NO ve

El guardián dio verde y aun así había trabajo mal hecho — la misma lección que `L-33` (escribir la
prueba y auditar el resultado son dos trabajos distintos):

| Hallazgo | Por qué el linter no lo veía |
|---|---|
| **9 punteros `30 · L-NN`** apuntando al archivo que ya no guarda esa lección — 6 en CÓDIGO FUENTE y uno **visible en producción**, dentro del globo de ayuda del mapa | El gate 5 solo comprueba que el ID exista en ALGUNO de los cuatro archivos. La ruta que lo acompaña no la mira nadie |
| El nodo `20` —cuyo único trabajo es «dónde vive cada cosa»— no listaba los tres hijos | El gate 10 busca el registro en `CLAUDE.md`, no en el árbol del `20` |
| Encabezados heredados que MENTÍAN: `## El módulo de campo original` sobre dos lecciones del mapa, `## Proceso` sobre seis de pantalla | Ningún gate lee lo que un encabezado agrupa |
| El trigger 🧪 decía «`30` (índice) y de ahí al hijo», pero **7 lecciones viven solo en la madre**: quien lo obedeciera al pie de la letra nunca llegaría a ellas | Ningún gate valida que la doctrina siga siendo cierta |
| El rótulo del `32` («pantalla») mandaba al hijo equivocado ante «Excel no me suma»: un CSV no es una pantalla | Ninguno: eso solo lo caza alguien intentando navegar de verdad |

Los cinco, corregidos. La deuda que queda escrita: **el linter no vigila la RUTA que acompaña a un
`L-NN`**; el arreglo natural es un gate que compruebe `3X · L-NN` contra dónde vive de verdad la
lección, y eso se edita en el kernel (`../brain-private/kernel/`), nunca aquí.

### Consecuencias

- Madre en **136 líneas de 350**; hijos en 126, 128 y 116 de 260. Espacio real para ~13 lecciones
  más por hijo antes de volver a plantearse nada.
- El arranque de sesión no se movió: el nodo `30` nunca fue always-on. `BOOT = 26,8k de 31,5k`.
- **Corregido de paso un dato que llevaba tiempo mal:** eran «34 lecciones» en la pizarra. Son
  **33** — el número 14 se fusionó en `L-13` y no existe, aunque la numeración llegue a 34.
  (Y ojo al escribirlo: citar esa etiqueta con su formato normal crea una referencia COLGANTE y
  pone el linter en rojo. Cazado al redactar este mismo ADR.)

### Crudo de respaldo

`research-archive/2026-08-03-workflow-shard-nodo-30.json`

---

## ADR-017 · 2026-08-03 · La capacidad longitudinal entra al contrato, y el veredicto llega al producto

**Estado:** ✅ Cerrado · `TODO-41` completo · contrato **v0.3.0** · 673 pruebas en verde

### Contexto

`ADR-012` construyó el eje longitudinal y dejó escrita su deuda: **ningún apoyo tiene veredicto en
este eje** porque falta un campo, `capacidadLongitudinal`. Su forma se deliberó allí con un workflow
de 7 agentes y quedó especificada; esta tanda la ejecuta con otro workflow de 8 agentes Opus
(especificación · 3 constructores · pruebas · 3 auditores adversariales).

### La decisión

> **`Apoyo.capacidadLongitudinal { valor_kgf, tipo, alturaReferencia_m, fuente }`**, aditivo y
> opcional. **El umbral depende del TIPO**: 50 % si es carga de *rotura* (coeficiente de seguridad
> 2), **100 %** si es *admisible* o de *diseño* —esos valores ya llevan su factor dentro, y volver a
> castigarlos aplicaría dos veces el mismo margen—. La lista de tipos es CERRADA: entre el 50 % y el
> 100 % hay un factor 2 sobre el veredicto de un apoyo, y ante un texto que no sea uno de los tres el
> sistema **no adivina el más parecido**.

> **`alturaReferencia_m` es obligatoria dentro del objeto.** Lo que rompe un apoyo es el MOMENTO, no
> la fuerza; una capacidad sin la altura a la que se ensayó no permite compararlos, y reescalarla en
> silencio devolvería un porcentaje impecable y falso, con veredicto encima.

> **NUNCA se deduce de `cargaRotura_kgf` ni se acepta un valor de LÍNEA.** Aquélla es ensayo
> TRANSVERSAL en punta; su validez en este eje depende de la sección del apoyo y de si hay retenida,
> y ninguna de las dos está declarada. Un veredicto heredado de otro apoyo es peor que no tenerlo.

### Lo que la auditoría adversarial cazó, y sin lo cual esto no valía nada

**Un agente murió a mitad de la fase de presentación** (`30 · L-24`) y dejó el trabajo entregado en
un estado que pasaba las 667 pruebas y **no servía para nada en producción**. Los tres auditores lo
encontraron por separado, cada uno ejecutando el motor:

| Hallazgo | Por qué las pruebas no lo veían |
|---|---|
| **El veredicto era INALCANZABLE desde la aplicación.** La utilización se calcula sobre el total, que exige `nFasesAmarradas` — un campo que NO existía en el contrato y que la vista no pasaba. Con la capacidad perfectamente declarada, las 24 filas seguían en «no evaluable» | Las pruebas llamaban al núcleo **directamente**, pasando el conteo por `opciones`. El camino real de la aplicación no lo hace. Es `L-28` por segunda vez en este proyecto |
| El informe firmable afirmaba **«Ningún apoyo declara su capacidad longitudinal»** contando VEREDICTOS, no capacidades. Con el inventario lleno seguiría negándolo — y mandando a corregir donde no está el hueco | Ninguna prueba ejercía «capacidad declarada **y sin** veredicto», que es justo el caso que produce la mentira |
| Un apoyo de **DERIVACIÓN** recibía un «cumple» verde. La cifra es el desequilibrio de la línea principal; lo que de verdad lo carga es el tiro del ramal, **que el sistema no ve** | La rama del Terminal ya declaraba ese punto ciego con esas palabras, pero la advertencia no viajaba al veredicto |
| El porcentaje **no se podía comprobar con una calculadora**: se calcula sobre el total y las columnas publicadas son POR CONDUCTOR | Es el mismo fallo que `ADR-013` arregló en el eje transversal, repetido aquí |

### Decisiones nuevas que salieron de arreglarlo

> **`Apoyo.nFasesAmarradas`** entra también al contrato, y se lee **del apoyo primero, de la línea
> después** — el patrón que ya usa `cargas.js` con `nConductores`. Un terminal amarra todas las fases
> y un apoyo de paso puede no amarrar ninguna: un conteo de línea es una suposición sobre cada
> estructura, y cuando se usa, **el criterio lo dice**. NO se hereda del conteo transversal: aquél
> cuenta 3·circuitos con el cable de guarda declaradamente fuera, y aquí el guarda —que va más
> alto— manda el momento.

> **La derivación NO se dictamina** mientras el modelo no capture el ramal. Se publica la cifra que
> sí se calcula y se niega el veredicto con el motivo escrito. Misma doctrina que la suspensión.

> **Se publican los dos hechos por separado**, en pantalla, CSV e informe: cuántos apoyos DECLARAN
> capacidad y cuántos llevan VEREDICTO. Un apoyo puede declararla y no llevar veredicto por otra
> razón, y decir lo contrario es una afirmación falsa sobre el inventario del cliente dentro de un
> papel que se firma.

> **El numerador viaja con el porcentaje**: `FL_total_kgf`, `N_fases_amarradas` y `Margen_kgf` en el
> CSV y en la fila. Sin ellos la cifra no es auditable, y la frase que gobierna el producto dice
> justo lo contrario.

### Consecuencias

- **Esto NO le da veredicto a LN-627, y así debe ser.** Ningún apoyo del inventario declara su
  capacidad longitudinal ni cuántas fases amarra. Las 24 filas siguen sin dictamen — pero ahora
  cada una dice CUÁL de los huecos tiene, y cada hueco se corrige en un sitio distinto. **No se
  sembró ni un dato** para «poder verlo funcionar»: eso está en las pruebas, con datos sintéticos.
- La promesa que el informe imprimía —«el día que el dato llegue, el veredicto sale solo, sin tocar
  código»— **era falsa cuando se escribió** y ahora es cierta: los dos campos existen y el motor los
  lee del apoyo. Verificado ejecutando los tres escenarios.
- **Deuda declarada:** el criterio impreso junto a un veredicto no menciona todavía dos supuestos
  que este eje arrastra —que el desequilibrio quede por debajo del ruido de tendido, y que lo domine
  un tramo que en el MODELO se derrumba bajo el 25 % de su EDS—. Los dos van hoy en las notas de la
  fila, que sí se publican; llevarlos al texto del veredicto queda pendiente. Tampoco viaja
  `funcionProcedencia`, y en LN-627 vale «deducido_geometria».


### ⚠️ DEUDA DESCUBIERTA el 2026-08-21: el apoyo MIXTO no existe en este modelo

Este eje tiene **dos casos y solo dos**: `terminal` —todos los conductores tiran a un lado,
`FL = ±H`— y `desequilibrio` —todos siguen de largo, `FL = (H₂−H₁)·cos(α/2)`—. Los dos calculan
**UNA carga por conductor** y la multiplican por `nFasesAmarradas`: dan por supuesto que **todos los
conductores amarrados están en el MISMO caso**.

Existe un apoyo real que no es ninguno de los dos: aquel donde **las fases siguen de largo pero el
cable de guarda TERMINA ahí**, porque el vano siguiente lo perdió y el cable quedó recogido y amarrado
a la estructura. Conviven un desequilibrio (las fases) y un terminal (el guarda) sobre la misma
estructura.

**Y el error va al lado peligroso.** Con `nFasesAmarradas = 4` el motor publica
`(H₂−H₁)·cos(α/2) · 4`, cuando lo real es `3·(H₂−H₁)·cos(α/2) + 1·H_guarda`. Como la diferencia entre
tramos contiguos es normalmente mucho menor que el tiro entero, **el número sale corto**: un «CUMPLE»
de más. Bajar el conteo a 3 tampoco lo arregla — sigue faltando el término del guarda. Es la misma
forma que el hallazgo del apoyo de DERIVACIÓN de arriba: una carga que el sistema no ve, saliendo en
verde.

**Mientras no se modele, un apoyo así no puede recibir veredicto longitudinal**: hueco con el motivo
escrito, que es lo que este sistema hace siempre que el modelo no alcanza. Falta además el dato que
decidiría la magnitud —si el guarda recogido quedó TENSO o flojo—, y hoy no existe ningún campo donde
ponerlo. Qué apoyos concretos de LN-627 están así vive en la BÓVEDA, no aquí: este repositorio es
público.

> **CERRADO POR EL DUEÑO el 2026-08-21: «omite las dos cosas, esto no es relevante».** Ni el freno ni
> el modelado del caso mixto se construyen. Queda escrito el hallazgo —que es real y sigue siendo una
> limitación del modelo— y queda escrito que el Ingeniero, que es quien conoce la línea, lo descartó
> por no relevante. **No se vuelve a plantear**: quien lea esto que no lo reabra sin dato nuevo.

### Crudo de respaldo

`research-archive/2026-08-03-workflow-capacidad-longitudinal.json`

---

## ADR-018 · 2026-08-04 · La carcasa «El Horizonte»: la piel clara como control de calidad, no como gusto

**Estado:** ✅ Cerrado · `TODO-47` completo · 6 fases en producción · 687 pruebas en verde
**Revisión externa:** ⚠️ **NO revisada externamente.** Hubo comité adversarial propio (4 críticos
Opus + sintetizador) pero **no** Consejo Externo. La decisión es reversible fase a fase.

### Contexto

El Ingeniero pidió la carcasa con estas palabras: *«Necesito un entorno muy similar al de mi MacBook
M4 Pro, es muy oscuro. También que todo lo que hemos consolidado se pueda apreciar al momento de yo
seleccionar LN-627, que todo se condense ahí, como un sidebar. Recuerda que se irán consolidando más
líneas de alta tensión en el proyecto.»*

Se entregaron cuatro maquetas navegables (`disenos/1..4`), **las cuatro oscuras**: se leyó «es muy
oscuro» como una petición de tema oscuro cuando era una **descripción** de su Mac. Al verlas corrigió:
*«sigue oscuro el entorno, necesito algo más armonioso, como paisajes»*. De ahí nace `5-horizonte.html`
y la partición de la elección en **dos decisiones separadas: el esqueleto y la piel**.

### Lo que la crítica de oficio encontró, y que gobierna la decisión

Cuatro críticos Opus adversariales, uno por maqueta, con el criterio *«cuál hace más difícil olvidar
que 0 de 24 apoyos tienen veredicto»*. Hallazgo **común a las cuatro**, re-verificado leyendo el
código y no aceptado del subagente:

> **Ninguna impedía que una línea se mostrara «sana» con CERO apoyos dictaminados, y dos lo
> afirmaban activamente.** En `2-tablero`, `estado: "firmable"` es una **cadena escrita a mano en los
> datos** que gobierna el punto verde, el sello y los contadores. En `3-expediente`,
> `firmable = !!(h && h.congelada) && L.estado === 'bien'` — no mira la capacidad de los apoyos en
> ningún punto. En `1-columnas` es omisión: `avisos()` suma evento, GPS, vanos fuera, amplificación,
> vanos largos, hipótesis y parcial, y **nunca** el veredicto; `estadoDe()` puede devolver `'ok'`.

### La decisión

> **Piel LUMINOSA sobre esqueleto de TRES COLUMNAS** (parque → secciones → contenido).

> **La piel clara no es una preferencia estética: es un control de calidad.** En pantalla oscura un
> dato que falta se ve oscuro y se confunde con el fondo; en pantalla clara se ve como un **agujero
> de luz** y el ojo va solo. Siendo el riesgo nº1 del producto *certificar sobre un hueco*, la piel
> que hace visible el hueco es parte del control, no del decorado. Motivo operativo adicional: bajo
> el sol del Caribe una pantalla oscura es un espejo, y cuando llegue la captura en campo (F4) el
> modo claro será el único legible.

> **El paisaje CARGA INFORMACIÓN, no decora.** El cielo codifica el estado de la línea; el horizonte
> dibuja los apoyos reales en su orden y a su distancia; **un apoyo sin veredicto se dibuja HUECO**.

### Alternativas descartadas, con su porqué

Las cuatro maquetas anteriores compitieron de verdad; el ranking del sintetizador fue
**1-columnas · 4-mapa · 3-expediente · 2-tablero**, con el criterio de arriba y no el gusto.

| Descartada | Por qué perdió |
|---|---|
| `2-tablero` — una pantalla densa por activo | La peor en lo que se juzgaba: la palabra «firmable» era una **cadena escrita a mano en los datos** que gobernaba el punto verde y el sello. Afirmaba salud sin mirar un solo veredicto |
| `3-expediente` — la línea como documento que se firma | La más honesta con lo impreso (lo que se ve es lo que sale por la impresora), pero `firmable = hipótesis congelada && estado === 'bien'`: **nunca miraba la capacidad de los apoyos**. Su virtud —el orden de firma— se conservó en la sección de Sello |
| `4-mapa` — el trazado manda, los datos en capas | La más brutal para contestar «¿DÓNDE está el problema?», y por eso quedó segunda. Perdió porque el mapa **no escala al parque**: con veinte líneas la pregunta deja de ser dónde y pasa a ser cuál. Su capa «inventario declarado» inspiró el dibujo hueco del horizonte |
| **La piel oscura de las cuatro** | Descartada por el Ingeniero al verlas: *«sigue oscuro, necesito algo más armonioso, como paisajes»*. Su «es muy oscuro» inicial describía su MacBook, no pedía tema oscuro — se había leído al revés |

Ganó `1-columnas` **pese a que su fallo era por omisión y no por afirmación**: `avisos()` contaba
evento, GPS, vanos fuera, amplificación, vanos largos, hipótesis y parcial, y **nunca** el veredicto.
Un fallo de omisión se arregla añadiendo la cuenta que falta; uno de afirmación exige desmontar lo
que el diseño promete. Por eso se eligió el esqueleto más reparable, no el más vistoso.

### Las invariantes que quedan establecidas — y que no se pueden relajar

1. **`amanecer` es INALCANZABLE si falta un apoyo.** El único estado que dice «al día» exige
   cobertura completa. Prueba dedicada: 23 de 24 dictaminados, nada por revisar, hipótesis
   congelada — y aun así no amanece.
2. **La cobertura se cruza POR APOYO, jamás comparando dos conteos.** Cinco apoyos con veredicto
   transversal y cinco con longitudinal pueden ser diez apoyos distintos y **cero** dictaminados;
   el menor de los conteos daría 5, que es una **cota superior**. Prueba con ese caso exacto.
3. **El veredicto se lee de `utilizacion_pct !== null`** —lo que el núcleo concluyó—, **nunca de
   `cargaRotura_kgf`**: que un apoyo declare su carga de rotura no significa que se le pueda
   dictaminar. Leer el campo sería reimplementar el dictamen en la capa de pintura.
4. **Un hecho, un dueño.** `vistas/ejesLinea.ts` es el único dueño de los dos ejes;
   `vistas/vanosLinea.ts`, de la numeración corrida de vanos. El propio `Cargas.tsx` ya advertía
   contra la alternativa: *«si cada pestaña calculara su propio tiro, bastaría un cambio en una para
   que la app se contradijera a sí misma ante el cliente»*.

### Cómo se ejecutó, y por qué en seis fases

Cada fase es un commit atómico, desplegable y reversible por separado. **F0** línea base de
visibilidad medida contra producción · **F1** tokenizar (113 literales → 61 tokens, probado byte a
byte idéntico) · **F2/F2b** higiene y contraste · **F3** la paleta · **F4** las tres columnas ·
**F5** el cielo · **F6** el horizonte.

La partición no fue burocracia: el conteo inicial de «14 colores quemados» **era falso** (la búsqueda
excluía la propia hoja de estilos; eran ~100 en 46 tonos, ocho de ellos mezclados con variables
dentro de degradados). Redefinir `:root` de golpe habría dejado media aplicación oscura sin forma de
saber si la regresión vino de la paleta o de la tokenización.

**Los valores de color no se eligieron a ojo ni se copiaron de la maqueta** (que solo define 3 de los
20 tokens que consume la app, y cuyo gris daba 3,34:1). Se inyectó la paleta candidata en la página
real de producción, se midió el contraste de cada texto contra su fondo efectivo en las 11 pestañas y
se corrigió hasta cero: el ámbar bajó a `#87540c` (5,07 en el peor de ocho fondos) y `--falla-tx` se
partió en dos —blanco sobre los círculos rojos, tinta oscura sobre las tarjetas ya claras—.

### Consecuencias

- **Medido contra producción, las 11 pestañas:** elementos bajo el mínimo de contraste **2 → 0**;
  ningún elemento perdido (los deltas fueron constantes: +5 en F4 y +6 en F5, exactamente los textos
  que cada fase añade).
- **Tres defectos preexistentes corregidos por el camino:** `.kpi-v.gris` no existía y el hueco
  central del producto se pintaba del **ámbar de una cifra buena**; la banda de estado contaba los
  expedientes **cerrados** como abiertos; el `@media print` era un **tema claro paralelo** que ya
  mentía (le faltaban `.fund-figura-caja` y `.calc-campo select`).
- **La lista de líneas ya existía y se descartaba** (`enlace.ts` la pedía para saber cuál abrir y
  tiraba el resto). Ahora viaja con el estado; con una sola línea la columna muestra una **y lo dice
  en pantalla**: «no se rellena con líneas de ejemplo».
- **14 pruebas nuevas** (673 → 687), incluidas cinco guardias del tablero de color y nueve del cielo.
  La guardia principal se probó por mutación: al retirar `.kpi-v.gris` se pone roja.
- **Código muerto retirado en el mismo cambio:** 11 tokens redefinidos del bloque de impresión, sus
  `!important` de color, y 7 imports huérfanos entre `Cargas.tsx` y `Linea.tsx`.
- **Lección nueva `32 · L-35`:** `deploy` no construye. Se desplegó un `dist/` rancio y la
  comprobación de propagación lo dio por bueno **porque comparaba producción contra ese mismo `dist`
  viejo**: el oráculo contaminado por la misma causa que el defecto.

### Huecos honestos — lo que la maqueta pedía y el dato de hoy no da

- **Zona y subestaciones origen→destino:** no existen en el contrato. Se eliminó el agrupador por
  zonas en vez de inventarlo.
- **Relieve:** plano, y rotulado en pantalla. La cota es GPS de mano con ±8 m declarados y el propio
  sistema se niega a dictaminar con ella; dibujar un perfil con eso sería inventar una montaña. El
  orden y las distancias de los vanos **sí** son reales.
- **El visor de fotos sigue oscuro a propósito:** una foto de campo se juzga sobre negro. Aclararlo
  por coherencia habría sido una regresión de producto disfrazada de coherencia.

### Deuda declarada

- Quedan sin portar 4 de los 6 bloqueantes que la crítica señaló como comunes: el contador de
  **parque** («X de N apoyos con veredicto en TODO el parque») no existe con una sola línea; el hueco
  todavía **no lleva a su evidencia con un clic** desde la carcasa; **Exportar no declara** la
  cobertura de veredicto en su tabla de completitud; y el salto por dirección web (mandar «mira
  LN-627 en Cargas») sigue sin existir.
- ~~El horizonte no dibuja los **dos ejes por separado**~~ → **SALDADA el 2026-08-04 (`TODO-53`).**
  El cruce se sacó a `vistas/coberturaEjes.ts`, dueño único, con los cuatro estados por apoyo y dos
  carriles de comprobación bajo el suelo. **La torre conserva DOS aspectos y solo dos**: rellena
  cuando las dos preguntas están respondidas, hueca cuando falta alguna. Queda prohibido un tercer
  aspecto —media torre, relleno parcial, opacidad intermedia—: se leería como «medio sano», y un
  apoyo con un solo eje respondido no está a medio dictaminar, está dictaminado en una pregunta y
  sin responder en la otra. Lo vigila `tests/horizonte-cobertura.test.js`, probado por mutación en
  las dos direcciones: volver al «y» a secas da 5 fallos; cambiarlo por un «o» —certificar sobre un
  hueco— da 3. Los tres estados nuevos **no son observables con el dato de hoy** (0 de 24 en ambos
  ejes): están probados contra fixtures, no vistos en producción. Se dice, no se disimula.

### De dónde salió cada dueño único de `web/src/vistas/`

Se anota aquí —y no en el mapa del repo, que dice DÓNDE vive cada cosa y no POR QUÉ— porque
duplicar uno de estos dueños es reabrir un fallo ya pagado:

- `ejesLinea` salió de `Cargas.tsx`.
- `vanosLinea` salió de `DetalleVanos`, para que el dibujo y la tabla no puedan discrepar.
- `coberturaEjes` salió de `Horizonte.tsx`, **donde el cruce estaba MAL**: pintaba hueco sin
  distinguir a qué eje le faltaba el dato (`TODO-53`).

### Crudo de respaldo

`research-archive/2026-08-04-workflow-critica-carcasa.json` (la crítica de oficio, 4+1 agentes)
`research-archive/2026-08-04-workflow-carcasa-horizonte.json` (reconocimiento, plan IAP y línea base)

---

## ADR-019 · 2026-08-04 · Cero registro público: el alta de personas es un acto administrativo

**Estado:** 🟡 **Parcial** — `TODO-50` con las fases 1 y 2a en producción; 2b, 3 y 4 abiertas.
**Revisión externa:** ⚠️ **NO revisada externamente.** Tampoco hubo comité: la decisión la fijó el
Ingeniero en el encargo («cero registros públicos, solo el administrador aprovisiona, asignando un
correo y una contraseña concretos»). Lo que se deliberó fue **cómo cumplirlo sin encender la
factura**, y eso se verificó con fuente, no con opinión.
**Escrito con retraso:** la ola se ejecutó el 04-08 y este ADR se redactó ese mismo día **al
auditar la documentación**, no al cerrarla. Estuvo unas horas viviendo solo en una celda de la
pizarra — la neurona que precisamente se poda. Es el fallo que `§G.3` existe para impedir.

### Contexto

Hasta el 31-07-2026 la única forma de entrar era «Entrar con Google». Eso no es un método de
ingreso: es una **vía de alta pública**. Cualquiera con una cuenta de Google podía crearse una
identidad dentro del proyecto, y ocurrió — una cuenta ajena se dio de alta sola. No llegó a leer
nada, porque sus reclamos eran `null` y las reglas exigen `orgId`, así que el diseño aguantó. Pero
una herramienta que va a sostener dictámenes de ingeniería no puede dejar que la lista de quién
existe la escriba internet.

*(La identidad concreta no se escribe aquí: este repositorio es público y es el dato personal de un
tercero. Vive en `NOTAS-OPERATIVAS.md` de la bóveda.)*

### La decisión

1. **El alta es un acto administrativo, no un formulario.** La única vía es `herramientas/usuarios.mjs`,
   que corre en la Mac del Ingeniero contra el Admin SDK con la llave maestra. Seis subcomandos:
   `alta` · `contrasena` · `rol` · `baja` · `restituir` · `auditar`. No hay pantalla de registro, y
   no la va a haber.
2. **Contraseña, no enlace de restablecimiento.** El Ingeniero eligió asignar la contraseña él. La
   cuenta nace con el reclamo `passwordProvisional: true` y mínimo de 12 caracteres.
3. **RBAC por *custom claims*, no por documento.** Cuatro roles con alcance escrito:
   `admin` (todo, incluida la bitácora de IA) · `editor` (líneas, apoyos, hipótesis, expedientes) ·
   `cuadrilla` (inspecciones y evidencias; **no toca activos ni expedientes**) · `auditor` (lectura
   completa, no escribe nada). Van en el token, y `firestore.rules` los lee de ahí: el permiso viaja
   con la credencial y no se puede falsificar desde el cliente.
4. **La organización existe desde el día 1** (`orgId`), aunque hoy solo haya una. Una columna de
   pertenencia añadida después obliga a migrar todo lo escrito sin ella.
5. **Las cuentas se DESHABILITAN, nunca se borran.** Borrar un usuario borra el rastro de quién
   hizo qué, y en un sistema que sostiene firmas eso no se recupera.
6. **Cada cambio de rol o de contraseña revoca los tokens vivos** (`revokeRefreshTokens`). Sin eso
   `setCustomUserClaims` no surte efecto hasta que el token caduca: **el rol viejo sobrevive hasta
   una hora**. Quitarle permisos a alguien y que los conserve una hora es peor que no quitárselos,
   porque se cree hecho.

### Alternativas descartadas, con su porqué

| Alternativa | Por qué NO |
|---|---|
| **Blocking function `beforeUserCreated`** (la defensa canónica: impide el alta de raíz) | Verificado con fuente el 2026-08-04: exige Identity Platform y se despliega como Cloud Function o Cloud Run — *«to deploy functions, your project must be on the Blaze pricing plan»*. **Blaze factura y no apaga**, lo que `ADR-001` ya descartó. Se sustituye por `auditar`, que **detecta** en vez de prevenir: lista las cuentas activas sin `orgId` y **sale con código 1**, para que un día pueda ser un gate. Es un compromiso consciente, no un descuido — ver `31 · L-38` |
| **Enlace de restablecimiento en vez de contraseña** | Decisión del Ingeniero: quiere asignarla él. Además el enlace viaja por correo, que es un canal que este proyecto no controla |
| **Que la herramienta acepte la contraseña por argumento o por tubería** | **Rechazado a propósito, y el código lo hace explícito**: si no hay TTY, `leerOculto()` aborta con *«La contraseña se teclea; no se acepta por tubería ni por argumento. Si llega por ahí, es que quedó escrita en algún sitio»*. Una contraseña en un argumento queda en el historial del intérprete de órdenes y en la lista de procesos. **Es también lo que impide que Claude la maneje**, que es exactamente lo que se busca |
| **Roles guardados en un documento de Firestore** | Un documento se lee con una consulta más, se puede quedar rancio y hay que protegerlo con sus propias reglas. El *claim* viaja firmado dentro del token |
| **Borrar las cuentas indebidas** | Se pierde el rastro. Se deshabilitan, y `restituir` existe por si fue un error |

### Consecuencias

- **Lo que ya está en producción:** la herramienta de aprovisionamiento (fase 1) y el ingreso con
  correo y contraseña (fase 2a). Las reglas con RBAC están desplegadas.
- **Google sigue habilitado como reserva, y eso es el hueco abierto.** No se puede retirar hasta que
  el Ingeniero se ponga contraseña: retirarlo antes lo dejaría fuera de su propio sistema. Es un
  bloqueo que **Claude no puede resolver**, por diseño.
- **La promesa que la herramienta hace y la aplicación aún no cumple:** `usuarios.mjs` dice por
  pantalla que «la aplicación le obligará a cambiarla en el primer acceso». Esa pantalla **no existe
  todavía** (fase 3). Mientras tanto, `passwordProvisional` es un reclamo que nadie mira, y
  `auditar` es lo único que avisa de quién no la ha cambiado.
- **App Check sigue sin existir** pese a que `CLAUDE.md §1` lo declara «obligatorio desde el día 1»
  (fase 4). Queda como bandera roja en `05`.
- **Enmienda a `ADR-004`:** de sus tres medidas de acceso del «día 1», el rol en *claim* ya está;
  App Check y la lista blanca de dominio de correo **no**. `ADR-001` y `ADR-002` describen además un
  mundo sin control de acceso que hoy ya no es cierto — la contraseña existe, el 2FA no.

### Crudo de respaldo

**No hay crudo: esta ola no se deliberó con comité ni workflow**, y decirlo es parte del registro.
Lo que sí hubo fue verificación con fuente (los planes de Firebase, el requisito de Blaze de las
blocking functions, el coste de Identity Platform), y esos hechos están arriba con su fecha. Si la
fase 3 o la 4 abren decisión de fondo, ahí sí corresponde comité.

---

## ADR-020 · 2026-08-04 · El segmento RCA: un método instrumentado, y lo que se le prohíbe hacer

**Estado:** ✅ Cerrado · `TODO-51` completo · contrato **v0.4.0** · 714 pruebas en verde
**Revisión externa:** ⚠️ **NO revisada externamente.** Hubo workflow adversarial propio (4 lentes
Opus + sintetizador) pero **no** Consejo Externo.

### Contexto

El Ingeniero pidió *«un segmento llamado RCA donde se analicen las fallas […] ishikagua, 5 porques,
arbol de causas, proponer hipotesis […] considera que se te aporte registro fotografico, hallazgos,
parametros de la linea, condiciones climaticas […] este segmento estara POR FUERA»*.

### La decisión

> **El RCA es un documento HERMANO, no una pestaña de la línea**, y el motivo no es de navegación:
> la causa raíz más cara de un parque es **la que se repite**. El mismo conector fallando en tres
> apoyos de dos líneas distintas es UNA causa raíz y TRES eventos, y desde dentro de una línea ese
> patrón es invisible **por construcción**. Además, un aviso de las 2 de la mañana aún no tiene
> apoyo identificado, y `Investigacion` lo exige con razón: un HECHO sí ocurre en un sitio.
> `Investigacion` queda **intacta**.

> **Las 6M se descartan.** Nacieron en un astillero para un proceso repetitivo; una línea es un
> activo lineal de cincuenta años. «Máquina» no existe aquí. **«Mano de obra» se elimina como
> espina** porque es la que invita a terminar el análisis en un nombre propio — el error humano
> entra como PROCESO y como REGLA, nunca como persona. **«Medición» no es espina sino eje
> transversal**: un error de medición no tumba una línea, tumba el ANÁLISIS. Quedan **once espinas**
> del dominio.

> **Cuatro estados de espina y ninguno es una aprobación**, y falta uno a propósito: **no existe «no
> aplica»**, que es el agujero del descarte cómodo. Descartar y sostener EXIGEN evidencia enlazada;
> «no evaluable» exige nombrar el dato que falta. Las once se pintan siempre.

> **Escalera de los porqués**: efecto → modo de falla → mecanismo físico → condición → regla. Una
> cadena que termina en el mecanismo físico **no es causa raíz**: describe física, no gestión, y
> sobre la física no se puede actuar.

### Lo que se le PROHÍBE al sistema — el veto del crítico, aceptado entero

| Función | Por qué se rechaza |
|---|---|
| Ranking automático de hipótesis | Ordenar **es** dictaminar |
| Causa raíz sugerida o árbol borrador por IA | Un borrador es un ancla; lo firmado sería del modelo con retoques |
| Porcentaje de confianza | «Un número sin fórmula detrás es una opinión», y además suena calibrado |
| Barra de progreso del análisis | Un análisis «al 92 %» empuja a cerrar |
| Sexto caso de uso de IA | Rompe la lista cerrada de ADR-004 |

Y **el botón de declarar la causa raíz NO EXISTE** mientras falte una de las seis condiciones: en su
sitio va la lista de cuáles fallan. Un botón deshabilitado invita a buscar cómo habilitarlo.

### El clima: lo que IDEAM sí da, y lo que no

Verificado con fuente el 2026-08-04. `datos.gov.co` (Socrata) responde con CORS abierto → se
consulta **desde el navegador**, sin servidor ni gasto (ADR-001 descartó Cloud Functions).

**Tres trampas cazadas antes de darlo por bueno:**
1. **La consulta se colgaba** (90 s sin respuesta): filtraba por coordenada sobre la serie de
   temperatura, veinte millones de lecturas sin índice geográfico. Se cambia al **catálogo de
   estaciones** `hp9r-jxuu`, que responde en 0,8 s.
2. **No toda estación mide clima.** El catálogo mezcla redes: cerca del evento de LN-627, **tres de
   las cinco estaciones más próximas son LIMNIMÉTRICAS** —miden el nivel de un río—. El criterio
   ingenuo habría elegido una y devuelto cero lecturas de viento: un hueco disfrazado de dato. Se
   filtra por categoría, con prueba.
3. **El objeto `ubicaci_n` del catálogo trae latitud y longitud INTERCAMBIADAS.** Se leen siempre
   los campos sueltos.

**Huecos declarados, no rellenados:**
- **RAYOS: no hay dato utilizable.** IDEAM no los publica en abierto. Existe `kscf-fk2u` «Rayos por
  circuito» en datos.gov.co, pero es de **otro operador**: cubre Caldas (150.188 registros),
  Risaralda (45.170), Quindío, Antioquia y Chocó, tiene **cero registros en el Caribe** y termina en
  **2024**. En una línea tropical el rayo es la causa nº1, así que el sistema declara SIEMPRE que no
  puede afirmar ni descartar una descarga.
- **Desfase de ~11 días**, medido en cada sondeo preguntándole a IDEAM su último registro; no se
  codifica un número que envejece.
- **Es una estación, no el vano.** La distancia va pegada al valor, nunca al pie.
- **La hora de IDEAM viene sin zona**; interpretarla como hora de Colombia es una inferencia
  NUESTRA y se declara como tal.

La consulta manda una **celda de rejilla**, no la coordenada del activo: el registro de consultas de
un tercero no tiene por qué saber dónde está una torre de un cliente.

### Consecuencias

- Contrato `v0.3.0 → v0.4.0`: `AnalisisCausa` y `SondeoClima` en `contratos/src/rca.ts`, dos
  colecciones nuevas con sus reglas, y `Evidencia.analisisId` como cuarto dueño posible.
  `sondeos_clima` es **inmutable** (`update: if false`): un sondeo es un hecho fechado, no una
  caché — si mañana IDEAM corrige la serie, el informe firmado debe seguir mostrando lo consultado.
- `nucleo/rca.js` y `nucleo/clima.js`, puros y probados. **27 pruebas nuevas** (687 → 714).
- **PRIMERA escritura del cliente a la base.** Hasta hoy la aplicación solo leía.
- Lección nueva `32 · L-36`: las reglas de Firestore no se despliegan con el sitio.

### La prueba que le da sentido: «la tormenta que no fue»

Falla nocturna con viento fuerte registrado a la hora del disparo. Es cómodo concluir que lo tumbó
el viento; pero en el Caribe hay viento fuerte muchos días y las líneas no se caen. **Una hipótesis
con sustento SOLO climático queda topada en «baja» por el motor**, no por la buena voluntad de quien
redacta. Verificado por mutación: al retirar el tope, la prueba se pone roja.

### Lo que este ADR debe registrar sobre su propia construcción

Al probar el guardado, Claude escribió un motivo plausible —«las fotografías no muestran hilos rotos
ni marcas de frotamiento»— que **la cuarta fotografía del propio expediente contradice**: «Hilos
rotos con extremos fundidos y oscurecimiento localizado». Se retiró del análisis.

Queda escrito porque es la mejor demostración disponible de las dos reglas del segmento: **enlazar
evidencia es obligatorio precisamente porque obliga a mirar lo que se afirma**, y **las palabras que
se firman son del ingeniero**, no de quien escribe el código.

### Deuda declarada

- El árbol se edita como lista con padre; no hay lienzo interactivo. El dibujo saldrá del dato.
- No hay estadística de parque ni correlación clima↔fallas: con n=1 sería un número con aspecto de
  análisis.
- ~~Las acciones (CAPA) no se pueden ni crear~~ → **SALDADA el 2026-08-05.** Viven en colección
  PROPIA (`acciones_capa`), no dentro del análisis: dentro de un array las reglas de Firestore no
  distinguen «cerrar una acción» de «reescribir el razonamiento tras firmar», y un análisis tiene
  que poder congelarse mientras sus acciones siguen vivas meses. Aditivo: `AnalisisCausa.acciones`
  se queda vacío, sin migrar nada. Tres reglas en `nucleo/rca.js`, probadas: cerrar exige quién,
  cuándo y prueba —evidencia enlazada o comprobación escrita, distinguidas y NO igualadas—; una
  correctiva cerrada tiene que decir qué barrera cubre; descartar exige motivo. La barrera NO es
  obligatoria para guardar: con trece en lista cerrada, obligarla empuja a elegir una al azar, que
  es el atajo que vaciaba el Ishikawa. Y se calcula **el hueco que más importa**: las barreras que
  el árbol declara falladas y que nadie cubre — una lista larga de acciones lo tapa perfectamente.
  ⚠️ El alta NO se ha ejercitado contra producción: las acciones no se borran por diseño y no se
  quiso dejar un registro de prueba en el análisis real (decisión del Ingeniero, 05-08). Verificada
  por pruebas y contra las reglas leídas a mano.
- ~~El sondeo de clima no se guardaba~~ → **SALDADO el 2026-08-05.** Se congela como documento
  inmutable (`sondeos_clima`, sin `update` ni `delete` ni para el administrador): un informe firmado
  tiene que enseñar lo que IDEAM decía ese día aunque después corrijan la serie. Al implementarlo se
  cazó un hueco del propio contrato: `SondeoClima` guardaba la estación pero NO la coordenada
  consultada, así que un sondeo guardado era ininterpretable en un análisis que abarca varios apoyos
  — la nota dice «a N km del punto» sin que conste cuál era. Se añadió `punto`. Consultar y guardar
  son dos actos distintos: guardar al consultar llenaría el expediente de tanteos.
- ~~El informe del análisis está pendiente~~ → **SALDADO el 2026-08-05** (`exportar/informeRca.js`).
  Autocontenido, y con la **sección de límites obligatoria que se arma SOLA** del dato: familias sin
  mirar (que no es lo mismo que descartadas), condiciones sin cumplir al declarar la causa,
  afirmaciones sin evidencia, defensas sin acción, límites del clima, y **siempre** el hueco de los
  rayos. Se puede imprimir a medias: la portada dice AVANCE o CONCLUSIÓN con una palabra, sin barra
  ni porcentaje. El papel se reutiliza de `informe.js` exportando sus primitivas, sin mover código.
- Queda el lienzo del árbol, que es cosmético: en papel una lista sangrada se lee igual de bien.

### Crudo de respaldo

`research-archive/2026-08-04-workflow-rca-lineas-at.json`

---

## ADR-021 · 2026-08-04 · El cerebro puede mentir con todos los gates en verde

**Estado:** ✅ Cerrado en lo que se reparó · 🟡 abre `TODO-54`, que es la parte que NO se decidió sola.
**Revisión externa:** ⚠️ **NO revisada externamente.** Auditoría adversarial propia de 5 lentes Opus
en paralelo (~1,32 M tokens). El sintetizador murió a mitad de respuesta; la síntesis la hizo el
integrador leyendo el diario, y **cada hallazgo aplicado se re-verificó abriendo el archivo citado**.

### Contexto

El Ingeniero preguntó, sin más: *«¿documentaste todo?»*. La respuesta no se podía dar de memoria
—§3.2 lo prohíbe—, así que se auditó. Y el resultado es lo que hace que esto sea un ADR y no una
nota: **de 49 hallazgos en bruto, 18 se confirmaron abriendo el archivo, y `npm run brain:check`
estuvo en verde todo el tiempo, antes y después.**

### El hallazgo que gobierna la decisión

> **El linter valida la ESTRUCTURA del cerebro. No puede validar que lo que dice sea VERDAD.**

Comprueba capacidad, que las referencias `L-NN` resuelvan, que no haya neuronas huérfanas, que los
crudos estén indexados, que un hecho declarado SSoT no esté duplicado. Todo eso estaba bien. Lo que
no vio, porque no puede:

| Lo que el cerebro afirmaba | La realidad |
|---|---|
| `05`: «Valor al **2026-07-29**» · «Misión: F0 · Verificación» | Seis días y 34 commits después, con el producto en producción |
| `05`: desplegar es `npm run deploy` | **Sin `build` delante** — literalmente la trampa de `L-35`, escrita en el nodo que se lee al arrancar |
| `CLAUDE.md`: «Datos: SQLite local en la Mac» | Firestore desde `ADR-004`, hace seis días |
| `CLAUDE.md`: «Cómputo servidor: ninguno» | El portero de fotos es un Worker vivo desde `ADR-010` |
| `20`: «445 pruebas» · «cargas.js sin vista aún» | 714 pruebas · `Cargas.tsx` lleva semanas en producción |
| `30`: el índice madre llega a `L-34` | `L-35` y `L-36` existían y eran **invisibles desde el índice** |
| `10`: la trampa del `dist/` rancio es `32 · L-36` | Es `L-35`. La referencia mandaba a la lección equivocada |
| 4 nodos: «los 33 `L-NN`» | 35 — la cifra se había copiado y se pudrió en los cuatro a la vez |

Y dos que no eran de documentación: **el correo real de un tercero publicado en el repo público**, y
`L-36` escrita ese mismo día **duplicando a `L-22`** — o sea, una tarde pagada otra vez por un error
que ya estaba documentado.

### La decisión

1. **Reparar los 18, y en el nodo dueño de cada uno**, no donde fuera cómodo. Altas: `ADR-019` (que
   no existía), `L-37`, `L-38`, `L-39`, `TODO-53`. Correcciones en `CLAUDE.md`, `05`, `10`, `20`,
   `00`, `30`, `31`, `32`, `disenos/README.md`, la bóveda y la versión del contrato.
2. **Toda cifra copiada se retira del nodo que no es su dueño.** El número de lecciones vive solo en
   `30`; el de pruebas solo en `05`. Un dato repetido en cuatro sitios no es redundancia útil: es
   garantía de que tres estarán mal.
3. **La tabla de stack de `CLAUDE.md` pasa a decir lo que HAY, no lo que se planeó.** El plan por
   fases vive en `99`, donde no envejece porque va fechado. Mezclar plan y estado en el router
   always-on es lo que mandó a buscar un `.sqlite` que nunca existió.
4. **Lo que NO se decidió aquí, a propósito:** que el linter vigile la frescura semántica. Se puede
   hacer —el mecanismo `verificado-vivo` ya existe y el kernel comprueba que no caduque—, pero se toca en
   `../brain-private/kernel/`, afecta al proyecto hermano y obliga a repartir versión. **Es del
   Ingeniero, no mía.** Queda como `TODO-54` con la propuesta escrita, no aplicada.

### Alternativas descartadas, con su porqué

| Alternativa | Por qué NO |
|---|---|
| **Responder «sí, está todo documentado»** | Era lo cómodo y habría sido falso. La pregunta se contesta auditando, no recordando (`§3.2`) |
| **Reparar solo lo grave y dejar lo menor** | Los que parecían menores eran los peores: la referencia `L-36` en vez de `L-35` manda a la lección equivocada justo al que está intentando no repetir el fallo |
| **Reescribir la historia de git** para borrar el correo del tercero | `main` no se reescribe (regla del proyecto). El dato se retira hacia adelante y **consta que el historial lo conserva**: decirlo es parte del arreglo. Borrarlo del historial es una operación aparte, con consecuencias, y la decide el Ingeniero |
| **Tocar el kernel para añadir el gate de frescura** | El kernel es de todo el ecosistema. Cambiarlo por iniciativa propia dentro de una tarea de documentación es exactamente el tipo de decisión cara de revertir que `§G.2` manda deliberar aparte |
| **Aceptar los 49 hallazgos del workflow** | 31 se descartaron: sin evidencia citada, cosméticos, o falsos al abrir el archivo. Un hallazgo de subagente es una hipótesis (`§3.2`) |

### Consecuencias

- **Lo que este ADR deja escrito para siempre:** el verde de `brain:check` significa *«el cerebro
  está bien construido»*, **no** *«el cerebro dice la verdad»*. Son dos preguntas distintas y solo
  una tiene guardián. La segunda hoy depende de que alguien audite a mano.
- **Se confirma `L-33` desde otro ángulo** («verde no prueba nada»): esta vez el verde no era de las
  pruebas sino del linter del cerebro, y engañó igual.
- **Y una incómoda que se registra sin adornos:** todos estos huecos los dejó Claude, en la misma
  sesión, con la doctrina de frescura (`§G.4`) escrita y a la vista. La regla existía; no se aplicó.
  Documentar al cerrar cada ola —y no al final— es lo que lo evita.

### Crudo de respaldo

`research-archive/2026-08-04-auditoria-documentacion-sesion.json` (5 lentes + diario completo)

---

## ADR-022 · 2026-08-05 · El Ingeniero fija el contexto real: herramienta interna, sin cliente ni contrato

**Estado:** ✅ Decidido por el dueño. **Retira supuestos de `ADR-001`** y deja `TODO-02` sin objeto.
**Revisión externa:** no aplica — es una declaración del dueño sobre su propio contexto, no una
decisión técnica.

### Contexto

Durante ocho días el cerebro dio por hecho un montaje comercial que **nadie verificó jamás**: cliente
AFINIA, contrato de mantenimiento, entregable aceptado por escrito, línea de proyecto para pagar la
infraestructura. De ahí salieron las «preguntas a AFINIA» que `ADR-001` dejó abiertas y que `ADR-003`
recortó a siete, y que la pizarra llevaba semanas llamando **«el cuello de botella de TODO»**.

Lo detectó el Ingeniero al leerlas: *«veo que siempre me hablas de un contrato y en ningún momento te
he enviado contrato de mantenimiento de líneas ni temas referentes»*. Tenía razón. Se rastreó el
origen y **todo procede del comité de 29 agentes del 2026-07-28**, que asumió el montaje comercial y
redactó las preguntas encima de ese supuesto. Ningún gate podía verlo: la estructura era impecable.

### La declaración del Ingeniero (literal, 2026-08-05)

> *«Una herramienta interna mía para la empresa donde trabajo, tal vez lo proponga como un ejemplo o
> estrategia de mantenimiento.»*

### Qué cambia

**1. No hay cliente a quien preguntar.** `TODO-02` queda **RETIRADO por falta de objeto**, no
completado. De sus cinco preguntas a AFINIA: la 2 ya la había cerrado `ADR-003`; la 1, la 4 y la 5
presuponen contrato y pagador, y desaparecen; solo la 3 —formato del entregable, MAGNA-SIRGAS y
esquema del GIS— sobrevive, y **solo si algún día se propone hacia fuera**.

**2. Lo que de verdad bloquea el producto NUNCA estuvo en esa lista.** Ninguna de las preguntas pedía
la **ficha estructural** —carga de rotura, altura libre, altura del punto de sujeción, fases
amarradas—, que es lo único que separa «cuánta carga recibe el apoyo» de «si aguanta». La pizarra
afirmaba que `TODO-02` la desbloqueaba. Era falso, y llevaba semanas escrito. Nace `TODO-57`, que es
el bloqueo real y **depende del Ingeniero, no de un tercero**.

**3. La residencia del dato deja de ser contractual y pasa a ser laboral.** La pregunta «¿el contrato
permite la nube fuera de Colombia?» no tiene sentido sin contrato. La que sí lo tiene: los datos
operativos del empleador —coordenadas reales y fotografías de infraestructura— viven hoy en Firestore
`southamerica-east1` (São Paulo) y en R2, bajo **cuentas personales del Ingeniero**. No es un
incumplimiento de nada conocido; es una exposición que él tiene que querer. La región de Firestore es
**inmutable**: cambiarla es rehacer, no ajustar. Nace `TODO-58`.

**4. Lo que NO cambia, y conviene decirlo:** el repositorio sigue siendo público y la regla de cero
bytes de cliente sigue siendo condición de supervivencia — más aún ahora, porque el dato es del
empleador y no de un cliente con contrato. El descarte de MapTiler y Stadia también se mantiene: una
herramienta interna de una empresa **es** uso comercial en sus términos.

### Alternativas descartadas, con su porqué

| Alternativa | Por qué NO |
|---|---|
| **Dejar `TODO-02` como estaba** | Era el ítem marcado «cuello de botella de TODO» en el nodo que se auto-carga. Habría seguido orientando cada sesión hacia un correo que no hay a quién mandar |
| **Reescribir las preguntas «por si acaso» hacia fuera** | Es inventar un destinatario. Si algún día se propone, se redactan con el interlocutor real delante |
| **Borrar el rastro del supuesto** | El error importa más que la corrección: es la prueba de que un comité de agentes puede fabricar una premisa entera y que ningún gate la ve. Queda escrito |

### Consecuencias

- **La misión cambia de sujeto.** Ya no es «esperar a AFINIA»: es que el Ingeniero consiga o levante
  la ficha estructural. El producto deja de depender de un tercero.
- **Se confirma `ADR-021` desde otro ángulo, y peor.** Aquello eran nodos que se pudrieron con el
  tiempo; esto **nació falso** y sobrevivió ocho días, un consejo externo y una auditoría de cinco
  lentes. La lección va a `30 · L-42`: lo que un comité ASUME entra al cerebro con el mismo rango que
  lo que verifica, y después es indistinguible.
- **Si algún día se propone como estrategia**, lo que hace falta no es una pregunta: es el informe
  gerencial (`TODO-42/37`) y un caso real terminado. Eso ya está en la cola.

### Crudo de respaldo

No hay crudo: es una declaración directa del dueño en la conversación del 2026-08-05. El supuesto que
corrige sí lo tiene — `research-archive/2026-07-28-comite-vision-arquitectura.md`, sección J.

---

## ADR-023 · 2026-08-05 · El informe GERENCIAL: derivado entero, y con lo que NO puede afirmar de titular

**Estado:** ✅ Cerrado · `TODO-42/37` completo · en producción.
**Revisión externa:** ⚠️ **NO revisada externamente.** Las 10 secciones venían especificadas del
workflow de 7 agentes de `ADR-012`; la construcción, sus prohibiciones y sus pruebas son propias.
**Nota de historial (2026-08-15):** este § fusiona DOS redacciones de la misma decisión, escritas en
sesiones distintas —`34b3d7e` (2026-08-05, al cerrar la ola) y `7c41e7c` (2026-08-06, tras el arreglo
del levantamiento a medias)—. No hubo dos decisiones: hubo un ADR documentado dos veces, y el número
`ADR-023` quedó duplicado en `99` y en `00`. Se fusionó sin perder contenido de ninguna de las dos;
lo único retirado es el conteo de pruebas congelado de la primera («785 pruebas en verde»), porque
una cifra copiada se retira del nodo que no es su dueño (`ADR-021`).

### Contexto

El sistema sabía producir el informe TÉCNICO —cómo se calculó cada cifra— y no tenía nada que
contestara las preguntas de una reunión, que no son las mismas: ¿puedo firmar hoy? · ¿qué mando el
lunes? · ¿qué queda abierto aunque lo haga todo? · ¿qué espera una firma MÍA? · ¿dónde va a apuntar
la primera pregunta del interventor? Con el contexto corregido en `ADR-022` (herramienta interna que
quizá se proponga como estrategia), este documento es justamente lo que hace falta para proponerla:
un caso real terminado vale más que cualquier explicación del sistema.

### La decisión

**Un documento aparte, no un resumen.** Contesta esas cinco preguntas, y ninguna de ellas la
contesta el informe técnico.

**Aquí no se calcula NADA nuevo**, y es la regla que gobierna el archivo. Las diez secciones se
derivan de funciones que ya existen y ya están probadas — `evaluarUmbrales`, `cargasDeLaLinea`,
`cantidadesGeometricas`, `coherencia`, `calidadLevantamiento`, `limitacionesDeclaradas`. Este módulo
solo ORDENA y TRADUCE.

No es pereza: el día que los dos papeles digan cosas distintas de la misma línea, la discusión deja
de ser sobre el cálculo y pasa a ser sobre cuál vale. Por eso la lista de límites usa
`limitacionesDeclaradas()` y `TITULO_LIMITACIONES` —**la misma función y el mismo título canónico**
que el técnico— y hay una prueba de amarre que se pone roja si el gerencial se escribe la suya.

**El titular de la primera página es lo que el informe NO puede sostener**, no lo que sí. La primera
cifra no es cuánto cumple: es cuántas cosas todavía no puede afirmar. Un documento que abre
celebrando lo que sabe y esconde al final lo que no, se lee como una conclusión que nadie sacó.

### Lo que tiene PROHIBIDO — todo con prueba, y con mutación que caza la prueba floja

| Prohibido | Por qué |
|---|---|
| **Un número o etiqueta de riesgo residual** | No hay probabilidad de falla, ni consecuencia en pesos, ni histórico con qué calibrarlos. «Riesgo residual: medio» es una medición inventada —peor que no poner nada— y se cita después como si fuera dato. Se entrega la LISTA de lo abierto, que sí es cierta |
| **Precio o plazo** | No hay tarifas ni rendimientos de cuadrilla. En un papel de gerencia una cifra inventada acaba convertida en compromiso |
| **Decir que la línea es segura** | El indicador que lo decidiría —el despeje al terreno— sale «no evaluable» por todos los caminos hoy |
| **Decir que ningún apoyo está sobrecargado** | Se sabe cuánta carga se le PIDE a cada estructura; no cuánta aguanta |
| **Ordenar sin declararlo** | La cola de atención dice con esas palabras que su orden es **criterio de gerencia, no resultado de cálculo** |
| **Un porcentaje de cobertura de inspección** | El cruce entre apoyos inspeccionados y estructuras del levantamiento no existe como función: se declara el hueco en vez de publicar un número que nadie calculó |
| **Texto escrito por un modelo de lenguaje** | `ADR-004`: la IA propone en `sugerencias/`, nunca escribe en el expediente. La única sección que no se deriva sola —recomendaciones por horizonte— **declara en el propio papel que envejece**, y cada renglón dice de qué fila nació; los que no nacen de una fila van rotulados «juicio del ingeniero», con nombre |

### Lo que se cazó construyéndolo, y no leyendo

- **`.find()` cogía el primer indicador con «tiro» en el id** —que en una línea normal es el que
  cumple— y la decisión pendiente del tope de tiro desaparecía del informe sin que nada avisara.
- **El propio papel contenía la etiqueta de nivel de riesgo, aunque fuera para negarla.** Una frase
  entrecomillada se cita fuera de contexto: no se escribe, ni de ejemplo.
- **Una prueba propia no vigilaba nada**: la que prohíbe columnas de costo exigía que la celda fuera
  exactamente «Costo», así que «Costo estimado» pasaba tranquila. Se cazó mutando el código.
- **`gerencialHtml` normalizaba el levantamiento con `objeto()` mientras el técnico usa
  `levSeguro()`.** Con un `lev` sin `puntos`, `calidadLevantamiento()` moría dentro de
  `lev.puntos.length` y el usuario habría visto una pantalla en blanco justo cuando el documento
  existe para decir qué falta. **Las 20 pruebas que ya existían pasaban con el fallo dentro**, porque
  su fixture traía `puntos: []`: un fixture más completo que la realidad no prueba el borde, prueba
  el camino cómodo. Se añadieron dos casos del estado cero, y la mutación los pone rojos a ellos y
  solo a ellos. Es familia de `30 · L-34`.

### Consecuencias

- Los tres datos que la pantalla no tenía se **derivan dentro del módulo** en vez de exigírselos: si
  la pantalla tuviera que saber de qué función sale cada uno, un día olvidaría uno y la sección
  saldría vacía en silencio.
- Con LN-627 hoy el documento sale honesto por construcción: cero apoyos con veredicto, el despeje
  no evaluable, el tope de tiro esperando una decisión, y **E06 con ×1,716 en la cola de atención**
  — que es el hallazgo accionable que no necesita ficha estructural.
- El papel se comparte con el técnico (`ESTILO`, escapes y `tabla` exportados de `informe.js`), sin
  mover una línea de sitio: sus 42 pruebas de oro siguen verdes.
- Con esto `TODO-42/37` cierra. Del RCA queda solo el lienzo del árbol, que es cosmético.

### Crudo de respaldo

`research-archive/2026-08-01-workflow-eje-longitudinal.json` — clave `resultado.gerencial`: las 10
secciones con su «qué responde» y su «de dónde sale el dato», más `datosQueYaExisten` y `noAfirmable`.

---

## ADR-024 · 2026-08-06 · La puerta de acceso: dos piezas, tres cerrojos, y dos controles descartados por redundantes

**Estado:** ✅ Cerrado · `TODO-50` fase 3 completa · en producción.
**Revisión externa:** ⚠️ **NO revisada externamente.** Workflow propio de 4 lentes Opus con crítico
de veto. **Los cuatro vetos se aceptaron enteros**, y dos de ellos no eran sobre lo que se iba a
construir: eran agujeros que ya existían.

### Los dos agujeros que el diseño destapó, y que no tenían que ver con la pantalla

**1 · `/config` se podía leer sin organización.** Era la única regla de lectura del archivo que decía
`allow read: if autenticado()`. Cualquier cuenta de Google que hubiera entrado al proyecto podía
leerla. Cerrada con `puedeLeer()`.

Y convierte en **FALSA** una frase que el proyecto repetía como prueba de que el incidente del
31-07 fue inocuo: *«no pudo leer NADA porque las reglas exigen `orgId`»*. Las demás sí lo exigían;
ésa no. Lo honesto, y así queda: esa cuenta **no pudo tocar dato de activo ni de cliente**, pero **sí
tuvo abierta la configuración operativa**. No consta que la leyera; consta que podía.

**2 · El botón «Salir» desaparecía justo cuando más falta hace.** Solo se dibujaba en las fases
`listo` y `vacio`; en `error` o mientras cargaba, no. O sea que la única pantalla donde de verdad
hace falta salir era la única sin salida. La sesión y los datos estaban atados y son dos cosas
distintas.

Los dos van **antes** que la pantalla, y no por orden caprichoso: una pantalla obligatoria construida
encima de una aplicación sin botón de salir es una puerta que se cierra por dentro.

### La decisión: el mecanismo es de DOS piezas

- **La ORDEN** la escribe el administrador en los reclamos del token, **con fecha**.
- **El RECIBO** lo escribe la propia persona en `usuarios/{uid}` al cambiarla, con fecha del servidor.

Con una sola pieza —solo la orden— la pantalla sería **una puerta que se cierra por dentro**: la marca
solo la apaga la herramienta desde la Mac del administrador, así que la persona cambiaría su
contraseña, volvería, y la misma pantalla la recibiría. Para siempre.

**Y la orden lleva fecha porque `contrasena` puede reponer una provisional una segunda vez.** Con un
recibo de sí/no, esa segunda no se exigiría cambiar nunca: el recibo viejo la taparía.

### Tres cerrojos para no encerrar a nadie, y por qué son tres

Hoy hay UN usuario real, es admin, entra por Google y no tiene contraseña. Cualquier fallo aquí lo
deja fuera de su propia herramienta.

1. **El proveedor.** Quien entró por Google pasa siempre. Es el cerrojo fuerte porque **no lo
   aprovisiona nadie**: lo estampa Firebase, y no depende de que una marca esté bien puesta.
2. **La marca se lee ESTRICTA** (`=== true`). Un reclamo con `'false'`, `1` o basura no encierra a
   nadie — todos son verdaderos si se leen con un `if` a secas.
3. **Ante la duda, se sigue.** La función no lanza jamás. Es fallar hacia abierto **a propósito**, y
   la razón se escribe: esta pantalla es HIGIENE, no la frontera. La frontera son las reglas y el
   rol. Una capa opcional nunca tiene veto sobre una esencial (`31 · L-11`).

Y una cuarta salida: la pantalla lleva **«Salir sin cambiarla»**.

### El orden de las tres operaciones es un invariante, y vive en el núcleo

`reautenticar → actualizar → dejar recibo`. Se reautentica **siempre**, no solo cuando Firebase se
queja: rompe de raíz el bucle «vuelva a entrar → entra → vuelva a entrar», y cierra el agujero de que
baste un portátil abierto.

**El recibo se escribe DESPUÉS y solo si el cambio salió bien.** Al revés se marcaría como hecho algo
que no ocurrió: una contraseña provisional viviendo indefinidamente mientras la auditoría dice que ya
se cambió. Es el único fallo de este diseño con daño de verdad, y por eso el orden está en un módulo
probado y no en un componente.

Si el recibo falla pero la contraseña sí cambió, **se entra igual**: negar la entrada por no poder
escribir una fecha sería castigar a la persona por un fallo del sistema.

### Lo que NO es, y está escrito en el propio archivo de reglas

**El recibo no es un control de seguridad.** Lo escribe el navegador: cualquiera con la consola
abierta puede escribirlo sin cambiar nada, y el daño se lo hace a su propia cuenta. Impedirlo exigiría
un servidor, que este proyecto no tiene por la regla de coste cero. Se acepta y se dice — decir lo
contrario sería repetir exactamente la frase que se retiró el 05-08.

### Dos controles DESCARTADOS por redundantes, no por falta de tiempo

| Descartado | Por qué |
|---|---|
| **Filtrar pestañas y datos por rol** | Esconder un botón no es seguridad: las reglas ya conceden la lectura a todos los de la organización. Y al `auditor` le recortaría justo lo que su oficio exige ver |
| **Comprobar el rol en el portero de fotos** | Los cuatro roles tienen derecho a la misma foto, el auditor el primero. Sería una segunda cerradura en la misma puerta y con la misma llave. El portero ya verifica firma, emisor, audiencia, caducidad y **organización**, y falla CERRADO si le falta configuración |
| **App Check** | Se enciende en una consola, no en el repositorio: `git revert` no lo deshace y su avería deja fuera al único usuario. Queda como `TODO-61`, con el coste por verificar |

### Y la regla de la contraseña deja de estar escrita dos veces

Firebase acepta 6 caracteres; la herramienta exige 12. Con dos copias, **la pantalla OBLIGATORIA
habría acabado debilitando** la contraseña que el administrador puso fuerte. Ahora vive en
`contratos/src/acceso.ts` y la importan los dos.

### Consecuencias

- 18 pruebas nuevas, todas sin navegador. **Las tres mutaciones se cazan**: quitar el cerrojo de
  Google (1 fallo), leer la marca con un `if` a secas (1), y escribir el recibo antes del cambio (3).
- El `switch` de fases de `App.tsx` **no tiene caso por defecto**: añadir una fase obliga a tratarla
  o la compilación se cae. El compilador vigila el olvido.
- ⚠️ **Queda por comprobar EN PANTALLA** que entrando por Google la pantalla NO aparece. Es la
  verificación que ningún test puede dar, y va antes de que el Ingeniero se ponga la contraseña.

### Crudo de respaldo

`research-archive/2026-08-06-workflow-blindaje-acceso.json`

---

## ADR-025 · 2026-08-06 · El método RCA contrastado contra IEC 62740: qué se puede firmar, y los tres defectos que destapó

**Estado:** ✅ Cerrado · `TODO-62` y `TODO-64` completos · 824 pruebas en verde · en producción
**Revisión externa:** ⚠️ **NO revisada externamente.** Workflow propio de 10 agentes Opus (4 de
fuente + 3 lentes + 3 auditores adversariales) y evaluación posterior con Fable, que corrigió tres
afirmaciones del informe. No hubo Consejo Externo.

### Contexto

El Ingeniero pidió contrastar el método RCA (`ADR-020`) contra la IEC 62740, la norma internacional
de análisis de causa raíz. Punto de partida verificado el 06-08: **el módulo no citaba NI UNA
norma** — cero referencias a IEC/ISO/IEEE/CIGRE/RETIE en `nucleo/rca.js`, `contratos/src/rca.ts`,
la pantalla y el informe. Las once espinas, eliminar «mano de obra», las seis condiciones y el tope
climático eran **criterio propio bien razonado, no cumplimiento normativo**.

### La decisión

> **La fórmula firmable es «método contrastado contra IEC 62740:2015», NUNCA «conforme a».** Y la
> razón de fondo no es un defecto nuestro sino la naturaleza de la norma: **la propia IEC declara en
> su prólogo que no atestigua conformidad** (*«IEC itself does not provide any attestation of
> conformity»*), y en todo el cuerpo verificable del método **no hay un solo requisito** — dice
> «should», nunca «shall». Es una guía de método, no un pliego que se cumpla o se incumpla. Nadie
> puede estar «conforme» a la IEC 62740.

> **Alcance de la verificación, declarado y no disimulado: se leyeron 13 de las 151 páginas** — el
> preview oficial gratuito, que cubre las cláusulas 1 a 4 y las quince definiciones completas. Del
> resto solo se conoce el índice. **Ninguna afirmación de este ADR se apoya en lo que no se leyó**, y
> por eso queda prohibido citar cualquier cláusula por encima de la 5.1.

> **NO se compra la norma** (CHF 380 / ~92 €). Es una herramienta INTERNA sin cliente ni contrato
> (`ADR-022`): nadie va a auditarnos contra IEC 62740, el valor de conformidad es cero, y el gasto
> choca con el free-tier sagrado. Lo que queda al otro lado del corte del texto público es
> curiosidad, no bloqueo.

### Lo que la norma SÍ respalda, verificado palabra por palabra

| Lo verificado | Dónde |
|---|---|
| *«root causes and conclusions backed up by documented evidence»* — y nosotros lo exigimos **también para los descartes**, que la norma no cubre | cl. 5.1 |
| **Regla de parada** (*«reasoned and explicit means of determining when a causal factor is defined as being a root cause»*): la norma exige que el criterio EXISTA y sea explícito, y **no prescribe cuál**. Nuestras seis condiciones lo son | 3.1.15 |
| Factor causal **necesario** y **contribuyente**, con nuestra misma definición. `suficiente` es extensión propia, NO normalizada | 3.1.9 / 3.1.3 |
| *«not designed to assign responsibility or liability»* — respalda haber eliminado «mano de obra» | cl. 1 |
| Los cinco pasos (iniciación, hechos, análisis, validación, presentación) y que los **cinco anexos A–E son INFORMATIVOS**: coincidir con un anexo informativo no es cumplir nada | Tabla 1 · índice |
| *priority*, *rank*, *confidence*: **CERO apariciones**. La prohibición de rankear del `ADR-020` no choca con nada | búsqueda en todo el texto |

### El hallazgo que valió el trabajo, y es INTERNO, no normativo

> *«A focus event normally has more than one root cause»* (3.1.12, Nota 1). Y **el sistema ya se
> contradecía a sí mismo antes de conocer la norma**: `nucleo/rca.js` imprime «este evento atravesó
> N defensas; corregir solo la causa deja las otras abiertas», y el molde de los datos solo deja
> declarar UNA (`contratos/src/rca.ts`, campo `causaRaiz` en singular). El motor afirma
> multi-causalidad y el formulario impone lo contrario. **Se resuelve con o sin IEC** → `TODO-63`,
> decisión fuerte, con ventana: con 0 causas declaradas es cambio de formulario; con 1, migración.

### Los tres defectos de código que destapó, y que YA están cerrados

1. **El desplegable de declarar no filtraba por nivel.** Ofrecía el árbol entero, así que se podía
   firmar «el conector se corroyó» —mecanismo físico— como causa raíz: exactamente lo que este
   método declara que NO lo es. Era el único sitio donde la regla de oro se podía violar, **y estaba
   en su propia pantalla**. Cerrado con `candidatosCausaRaiz()` en el núcleo.
2. **El informe reimplementaba el juicio de las cadenas, y lo reimplementaba mal.** Miraba el ÚLTIMO
   eslabón; el núcleo mira el MÁS ALTO. Falso positivo (cadena que llegó a «condición» y volvió atrás
   —caso contemplado a propósito— salía avisada) y falso negativo (cadena muerta en el modo de falla,
   sin aviso ninguno). Ahora consume `fuerzaCadena`.
3. **Un comentario del núcleo prometía un control inexistente**: que `validarArbol` detecta «un nodo
   que culpa a una persona». No existe. La protección real es la TAXONOMÍA —«mano de obra» no está
   entre las once familias—, no un control. Se corrige el comentario; **no se implementa el control**,
   porque exigiría interpretar prosa libre y este módulo mide, no interpreta.

**Las dos decisiones de diseño del arreglo, que no son de gusto:** los nodos que no califican **se
pintan y no se pueden elegir**, no se esconden (lo que desaparece de una pantalla se lee como que no
existe — la misma razón por la que las once espinas salen siempre); y la falta de evidencia **señala
pero no bloquea**, porque bloquear sería inventar una séptima condición de cierre y las seis las
decidió el `ADR-020`.

### Lo que Fable corrigió del informe, y por qué queda escrito

- **«No hay ni un solo *shall*»: falso.** Hay 3, todos en el boilerplate legal de la IEC (patentes,
  responsabilidad civil). La conclusión de fondo aguanta; la afirmación literal no. En un trabajo
  cuya tesis es «no afirmes sin verificar», una afirmación universal falsa sale cara.
- **«El evento foco es singular, y eso respalda nuestro árbol de una sola raíz»: sobrelectura a favor
  propio.** 3.1.4 Nota 1 dice que un evento *«can have several causes»*. Vestir una decisión nuestra
  con respaldo normativo prestado es justo lo que el informe reprochaba en otros.
- **El argumento más barato y demoledor estaba sin usar**: que la IEC no atestigua conformidad, en el
  prólogo que el propio informe había leído.

### Consecuencias

- `nucleo/rca.js` gana `candidatosCausaRaiz()`; el informe consume `fuerzaCadena` y por fin imprime
  `hojasNoAccionables`, que llevaba desde el día 1 calculado, probado y **sin un solo consumidor**.
- Lección nueva `33 · L-45`: **una regla que el motor calcula y nadie consume no es una regla, es un
  comentario** — y el remedio de `L-28` (grep del módulo) da luz verde, porque el módulo SÍ se
  llamaba: lo que se caía al suelo era un campo de la respuesta.
- Las dos olas se verificaron **por mutación**, no por verde: 3 pruebas rojas cada vez.
- Queda un catálogo de huecos priorizado en el crudo, del que salen `TODO-63` y los pendientes de
  método que decide el Ingeniero (familia de protección y control, separar acto malicioso de
  vegetación, séptima condición de cierre, verificación de eficacia de las acciones).

### Crudo de respaldo

`research-archive/2026-08-06-workflow-rca-vs-iec62740.json` (crudo) ·
`research-archive/2026-08-06-informe-rca-vs-iec62740.md` (síntesis corregida)

---

## ADR-026 · 2026-08-07 · Varias causas raíz, cinco familias nuevas y la séptima condición

**Estado:** ✅ Cerrado · `TODO-63` y `TODO-65` (4 de 5) completos · 849 pruebas en verde · en producción
**Revisión externa:** ⚠️ **NO revisada externamente.** Las tres decisiones las tomó el Ingeniero
sobre el catálogo de huecos de `ADR-025`; el diseño de cada una es propio.

### Contexto

`ADR-025` dejó un catálogo de huecos priorizado. El Ingeniero eligió tres y **descartó uno**
—verificar la EFICACIA de las acciones, que queda pendiente y sin fecha—. Todo lo que sigue es
**ADITIVO**: no se renombró ni una clave, así que ningún expediente escrito migra ni se rompe.

### 1 · Varias causas raíz

> **`causasRaiz` es una lista**, y cada entrada lleva su **tipo** según la tipología de
> IEC 62740:2015 cláusula 4 —leída en el texto público, no citada de memoria—: `unica` (caso a),
> `multiple` (caso b: eliminar cualquiera evita el evento) y `contribuyente` (caso c: eliminarla
> **cambia la probabilidad pero puede no evitarlo**). Esa tercera distinción es la que impide
> prometer que la falla no vuelve, y por eso el motor publica un aviso cuando todas las causas
> declaradas son contribuyentes.

**No lo pedía la norma: lo pedía el propio sistema.** `resumenBarreras` avisaba desde el primer día
de que «este evento atravesó N defensas: corregir solo la causa deja las otras abiertas», y el
formulario obligaba a comprimirlo en una línea. El motor afirmaba una cosa y exigía la contraria.

- **`causaRaiz` singular se queda de SOLO LECTURA.** Cero migración.
- **Dueño único de la precedencia: `causasDeclaradas()`.** Si la pantalla y el informe eligieran cada
  uno entre el campo viejo y el nuevo, llegaría el día en que enseñan causas distintas del mismo
  expediente. Lo que devuelve del campo viejo se marca `esLegado`, y el informe imprime que ese
  expediente se firmó cuando solo cabía una — **que aparezca una sola no significa que se
  descartaran otras**.
- **CANDADO:** `ParteDeAnalisis` rechaza un parche que traiga los dos campos a la vez. Es exactamente
  la trampa `estado`/`cerrado` que ese mismo archivo ya documentaba.
- **Por qué AHORA:** con cero causas declaradas en producción esto es cambiar un formulario; con una
  sola ya escrita, habría sido migrar un documento firmado.

### 2 · Cinco familias nuevas (once → dieciséis)

> **`proteccion_control` era el hueco grave.** Hasta hoy la protección existía SOLO como barrera y
> nunca como causa, así que un análisis nuestro **no podía concluir «la línea no falló: falló el
> relé»** — un desenlace corriente. Ajuste mal coordinado, teleprotección que no llegó, alimentación
> de corriente continua caída: ninguno tenía dónde alojarse.

> **`terceros_accidentales`, `acto_malicioso`, `fauna` y `fuego` salen de dentro de «vegetación y
> servidumbre»**, donde vivían escondidos en un comentario. Se separan porque **la acción que sale de
> cada una es distinta** —podar, señalizar y coordinar obras, vigilar y denunciar, controlar quemas—:
> una familia que mezcla las cuatro produce un plan de acción que no sirve para ninguna. Y un
> atentado no es vegetación.

⚠️ **`vegetacion_servidumbre` NO se renombró ni se partió: se ESTRECHÓ.** Un expediente anterior al
2026-08-07 puede tener ahí dentro un tercero o una quema, y **eso es un hecho fechado, no un error
que haya que ir a corregir**. Nueva barrera además: `contencion_falla` — la pregunta que ninguna de
las trece hacía, *¿por qué cayeron seis apoyos y no uno?*

### 3 · La séptima condición para declarar

> **Ninguna hipótesis rival se queda viva y callada.** Se podía declarar la causa raíz con cuatro
> rivales sin tocar, que es justo lo que produce **informes convincentes y equivocados**. Ahora cada
> rival exige `queSeHizo` y `resultado`.

**`no_concluyente` CUENTA como cerrada, y no es una puerta trasera:** la condición no obliga a tener
un veredicto, obliga a que alguien haya ido a mirar y haya escrito qué pasó. Exigir un veredicto
fabricaría la certeza que este método existe para impedir — y además dejaría **atrapada para
siempre** a cualquier hipótesis topada por el tope climático, que nunca puede pasar de «baja». Hay
una prueba dedicada a esa trampa.

### Consecuencias

- El informe decía «de 11 familias» con el número clavado a mano, y ya mentía. Ahora lo lee de la
  lista del núcleo.
- **Coste real de la decisión, que conviene tener presente:** son cinco filas más que recorrer antes
  de poder cerrar un análisis. El descarte razonado es el producto, pero el trabajo sube.
- Verificado por MUTACIÓN dos veces: séptima condición sin dientes → 2 rojas; precedencia ignorando
  la lista nueva → 4 rojas.

### Deuda declarada

- **Verificar la EFICACIA de las acciones sigue sin hacerse** (el Ingeniero lo dejó fuera): hoy una
  acción que se ejecutó y no sirvió es indistinguible de una que funcionó.
- Las reglas de Firestore **no filtran campos** por nombre, así que `causasRaiz` no necesitó tocarlas.
  Es cómodo hoy y es una puerta abierta: conviene revisarlo cuando el molde se estabilice.

### Crudo de respaldo

`research-archive/2026-08-06-workflow-rca-vs-iec62740.json` (de donde salió el catálogo de huecos)

---

## ADR-027 · 2026-08-16 · La identidad de un punto nace de su NOMBRE CANÓNICO; las semillas posicionales de julio quedan ancladas en un registro que solo crece

**Estado:** ✅ Decidido · ⚠️ **NO revisada externamente** *(el estado vivía solo en la tabla de `00`; se trae a su dueño el 21-08).*

### Contexto

La cuadrilla volvió a campo el **11 y 12 de agosto de 2026** y trajo tres puntos que el
levantamiento de julio no tenía. El Ingeniero decidió el **2026-08-16**: se cargan dos —el
**empalme** que cae dentro del vano E03→E04 y el **pórtico del extremo final**, un apoyo real con un
vano de 94,65 m después de E24— y el tercero, el **pórtico del extremo de origen**, queda
**PENDIENTE DE VERIFICACIÓN**, no descartado.

Cargarlos era imposible sin romper algo. `herramientas/sembrar.mjs` ataba la identidad de un apoyo a
su POSICIÓN en el array del levantamiento por **tres vías distintas a la vez**: el id
(`idEstable('apoyo-' + i)`), el `orden` (`orden: i`) y el nombre canónico (`CANONICOS[i]`). Un punto
intercalado corría las tres. Y el id de un apoyo es el **único** enlace con sus **99 fotos**
(`Evidencia.apoyoId`) y con el **expediente de la falla** (`Investigacion.apoyoId`): si se mueve, no
revienta nada — las fotos quedan huérfanas y la aplicación dibuja «no identificada», un marcador que
desaparece o un apoyo sin fotos. Fallo silencioso, el peor que hay. Encima **`npm test` habría
seguido verde**: no existía en el repositorio ningún listado de los ids emitidos.

Sobre los nombres, palabras del Ingeniero: *«interpretemos las estructuras como yo las tipifiqué en
el módulo; la fuente original tuve un error al nombrarla, pero si analizas el recorrido de la línea
de principio a fin, el orden está correcto»*. El nombre grabado en el GPS **no es identidad**: el
apoyo que la línea llama E07 quedó grabado como "E02", y donde la línea tiene su E02 el GPS guardó
"LN 627 E022".

### Decisión

**La semilla del id sale del NOMBRE CANÓNICO. Nunca del índice del array, nunca del nombre de campo.**

1. **`herramientas/identidad.mjs`** (nuevo, puro, sin `firebase-admin`): dueño único de la fórmula
   del id, que **no se tocó ni un byte** (`sha256("org|línea|semilla")` recortado a 32 hex). Lo único
   que cambia es quién produce la cadena `semilla`.
2. **`herramientas/semillas-emitidas.json`** (nuevo, en el repo **PÚBLICO** a propósito): registro
   **que solo crece**, con las 28 filas emitidas. Las 26 de julio conservan su semilla posicional
   legada (`apoyo-0`…`apoyo-25`) y por eso devuelven **exactamente los mismos 26 ids**, byte a byte.
   Los puntos nuevos reciben `punto:<nombre canónico>` — el espacio legado es exactamente
   `/^apoyo-\d+$/`, así que un nombre canónico es *sintácticamente* incapaz de robar la semilla de
   otro apoyo. Está en el repo público porque la prueba que fija los 26 ids **tiene que correr en
   CI**, que es justo donde la bóveda no está; y no publica nada de cliente: los nombres canónicos ya
   estaban en el sembrador y los ids son hashes de una cadena pública.
   Una vez escrita una fila, **manda el registro y ya no el nombre**: renombrar mañana un punto no
   mueve su id.
3. **Orden por BISECCIÓN**: el empalme entra con `orden = (2 + 3) / 2 = 2,5` y el pórtico con
   `26`. Los 26 documentos de producción **no se reescriben**.
4. **`contratos`**: `Apoyo.orden` pasa de `z.number().int().nonnegative()` a
   `z.number().nonnegative()` y `VERSION_CONTRATO` de `0.4.0` a **`0.5.0`**.
5. **El expediente de la falla se ata por `apoyoCanonico`** (`LN-627 E02`), con `estructuraOrden: 1`
   conservado como control cruzado contra la lista de julio. Sigue colgando del **mismo apoyo**:
   `24e428a7-021e-6fbf-15de-60d95fcd8c33`.
6. **Nada por defecto en un punto nuevo**: sin `funcionEstructural` declarada, la construcción
   **aborta** en vez de caer a `'Suspensión'`. Y el tipo de punto sale del campo `rol` del fixture, no
   del regex `/EMP/i` — el código del pórtico no contiene "EMP", y que eso funcionara era
   casualidad.
7. **Lo no aprobado no se carga y SE DICE**: el sembrador imprime el pórtico de origen como ignorado
   en cada corrida, con su motivo, y no lo borra del fixture.

### Alternativas descartadas

- **Correr los `orden`** (renumerar al insertar). `subir-evidencias.mjs` resuelve la foto por este
  campo: insertar el empalme en la posición 3 movería **64 de las 99 fotos**, y como la ficha se
  escribe con `merge` sobre un id derivado del hash del ARCHIVO, el re-run **pisaría** la asignación
  correcta sin dejar rastro. Renumerar con huecos de 10 tiene el mismo defecto y solo lo aplaza.
- **Poner el empalme al final** (orden 26,5). La posición en la secuencia ES el dato: de ella se
  deduce en qué vano vive un empalme. Al final daría `enVano: null` y la traza dibujaría un salto
  hacia atrás.
- **Re-sembrar con ids nuevos.** `firestore.rules` tiene `allow delete: if false` en `apoyos` y el
  sembrador escribe con `merge`: una resiembra **no reemplaza, AÑADE**. La aplicación cargaría 26
  viejos más los nuevos a la vez y los vanos saldrían duplicados sin un solo error.
- **Llamar «E25» al pórtico.** Le atribuiría al Ingeniero una tipificación que no hizo (su lista
  termina en E24), un pórtico de subestación no pertenece a la serie numerada, y el de origen no
  admitiría número alguno. Además `exportar/calidad.js` saca el número final del nombre para detectar
  huecos: con "E25" aparecería un hueco inventado el día que se cargue el otro pórtico. Sin tilde
  ("PORTICO") a propósito: el nombre es la clave del hash y NFC ≠ NFD.
- **Fusionar los dos fixtures de la bóveda.** El de julio es la línea base de no regresión contra el
  módulo de campo original; mezclarlos la destruiría. Ampliar es un **hecho fechado**, no una
  sobrescritura (`CLAUDE.md §3.1`).

### Consecuencias

- **Cifras nuevas del levantamiento** (derivadas ejecutando el motor, ver `40 §10`): 28 puntos ·
  **25 estructuras** · 3 empalmes · **24 vanos** · promedio **125,99 m** · mediana **99,89 m** ·
  desviación **77,30 m** · CV **61,35 %** · longitud levantada **3.023,67 m** · **7 tramos**
  `[1,2,2,14,1,3,1]` · 8 anclas. Vano máximo (336,70 m) y mínimo (13,35 m) **no cambian**.
- **Las cifras de julio siguen vivas e intactas** en `tests/estadisticas.test.js` y
  `tests/exportar.test.js`, que leen SOLO el fixture de julio. Que sigan verdes sin cambiarles una
  cifra ES la prueba de que julio no se sobrescribió.
- **ORDEN DE OPERACIONES OBLIGATORIO**: desplegar la web con el contrato **0.5.0** y **solo después**
  sembrar. Con el contrato anterior, un `orden` fraccionario se descarta en silencio
  (`web/src/datos/firestore.ts` valida y filtra). Se hace cumplir en código: el sembrador se niega sin
  la bandera `--contrato-050-desplegado`.
- **113 pruebas nuevas** (900 → 1.014), tres archivos nuevos: `tests/identidad-apoyos.test.js` (los
  26 ids escritos literales, registro auto-verificable y guardián por TEXTO contra volver a atar la
  identidad a la posición), `tests/sembrar-mapeo.test.js` y `tests/ampliacion-2026-08.test.js`.
- **Bug ya vivo, arreglado y declarado**: `exportar/levantamiento.js` no emitía el `id` del apoyo, y
  `exportar/informe.js` lo busca para casar el expediente ⇒ la **sección 10 del informe firmable
  imprimía SIEMPRE «Estructura no identificada en este levantamiento»**. Un campo aditivo lo cierra,
  con prueba que se pone roja sin él.

### Deuda declarada

- **`subir-evidencias.mjs` sigue resolviendo la foto por `orden`.** Con bisección ningún orden se
  corre y las 99 fotos no se mueven, así que hoy es seguro — pero el acoplamiento sigue vivo y **hay
  que romperlo (resolver por nombre canónico) ANTES de cargar el pórtico de ORIGEN**, que va antes de
  E01.
- **Tipificar el pórtico como 'Terminal'** es decisión de ingeniería declarada por el sembrador, aún
  **no firmada** por el Ingeniero: mueve los tramos de 6 a 7 y las anclas de 7 a 8, que son entrada
  del cálculo mecánico.
  **CERRADO el 2026-08-17.** El Ingeniero declaró que **el pórtico del extremo FINAL es el final de
  la línea** (dijo el nombre de la subestación; aquí no se escribe — por eso los nombres canónicos
  son ORIGEN y FIN). Su función Terminal pasa a `confirmado_humano`, declarado en el fixture de la bóveda con
  la fecha — no en el código: el defecto del sembrador sigue siendo `'supuesto'`, y la firma se pone
  una a una. Lo que confirma es la TIPIFICACIÓN, no la geometría: el vano de 94,65 m y el corte de
  tramos ya estaban verificados con el motor.
- **E24 se queda como está sembrado ('Terminal')** aunque la línea ya siga más allá, y esto SIGUE
  ABIERTO tras la confirmación del 17-08: que el pórtico sea el final dice que E24 deja de serlo, no
  qué pasa a ser. Re-tipificarlo es decisión del Ingeniero. Consecuencia aceptada mientras tanto: un
  tramo final de un solo vano (94,65 m) entre dos anclas consecutivas —que es válido y es lo
  conservador, porque no mueve ninguno de los seis tramos existentes—. Lo que sí cambia el día que se
  siembre: E24 deja de ser extremo y **le aparece un quiebre de 72,1°** que hoy no tiene, de modo que
  `nucleo/cargas.js` empieza a calcularle una carga transversal que hasta ahora dejaba en NO
  EVALUABLE por falta de ángulo, con un factor de amplificación de ×1,18. Es un apoyo más en la lista
  de los que amplifican, donde hoy hay tres.
- **Los 28 ids no son UUID RFC-4122 válidos** (fallan versión y variante). Hoy pasan porque la zod
  instalada usa la expresión laxa; una subida los tumbaría en la validación y la línea se quedaría
  vacía sin error visible. No se arreglan —cambiarlos movería los 26— y se blindan con una aserción
  que se pondrá roja en CI, no en producción.
- **La placa física «002» del expediente no se ha leído en campo**, y en el levantamiento conviven un
  apoyo cuyo canónico es E02 y otro cuyo nombre de GPS es "E02". La atadura actual está corroborada
  de forma independiente (la deflexión calculada del apoyo da 64,68°, el mismo número que el pie de
  la foto de la falla), pero la ambigüedad queda como verificación pendiente del expediente.
- **Nada de esto se ha contrastado contra Firestore**: la llave de administrador está pendiente de
  regenerar. Las pruebas fijan lo que el sembrador PRODUCE, no lo que hay escrito en producción. El
  primer sembrado real debe correrse en **modo seco** y comparar los 26 ids contra los documentos
  existentes antes de escribir.

**NO revisada externamente.**

### Lo que cazó la auditoría adversarial, con todo en verde

Tres lentes adversariales revisaron lo construido y las tres dijeron **«no se puede commitear»**, con
1.014 pruebas en verde. Los cuatro defectos se corrigieron antes del commit, cada uno con su prueba:

1. **Una hora real de la cuadrilla dentro de un mundo declarado sintético.** `tests/sembrar-mapeo.test.js`
   inventaba las coordenadas y lo decía en su cabecera, pero **copiaba los instantes de captura** de
   los GPX de la bóveda, byte a byte, junto con los códigos de waypoint de las dos subestaciones. Es
   dato de cliente —dice cuándo estuvo la cuadrilla en campo— en un repositorio **público**, y la
   historia de git es permanente (`33 · L-07`). La cabecera que promete «esto es sintético» es
   precisamente lo que impide releerlo con sospecha: → **`33 · L-50`**.
2. **La firma del Ingeniero puesta sobre lo que no firmó.** Un punto nuevo se sembraba con
   `funcionProcedencia: 'confirmado_humano'` por defecto, así que la ficha habría impreso «Terminal ·
   confirmada por el Ingeniero» sobre una tipificación que él **no ha confirmado** —de hecho está
   entre las preguntas abiertas— y la memoria de cantidades habría contado esa ancla como verificada
   en campo. El molde ya tenía el valor exacto (`'supuesto'` — «⚠️ nadie lo verificó») y no se usaba.
   Hoy el defecto es `'supuesto'` y hay que declarar la confirmación explícitamente. Agravante: los
   apoyos **no se pueden borrar** (`firestore.rules`), así que el documento con la atribución falsa
   se habría quedado.
3. **La bisección repartía hacia atrás.** Dos puntos intercalados en el mismo vano salían en orden de
   recorrido **invertido** (`E03 · B · A · E04`) porque el segundo bisecaba contra el primero en vez
   de detrás de él. Y una prueba recién escrita **sellaba la inversión como correcta**. Contradecía lo
   único que el Ingeniero declaró verdad de la fuente original: *«si analizas el recorrido de la línea
   de principio a fin, el orden está correcto»*. Hoy el orden de declaración es el de recorrido.
4. **Un punto que va ANTES del primero no tenía camino, y se colocaba igual.** Es el caso del pórtico
   de origen. Marcarlo «al final» lo dejaba detrás del pórtico del otro extremo, con la longitud
   saltando de 3.024 m a 16.080 m y dos vanos falsos de 6,6 km, **sin un solo aviso**. Hoy aborta con
   el motivo escrito: bisecar por delante daría `orden` −1 (el molde exige no negativo) y renumerar es
   justo lo que esta decisión evita. Cuando el punto se apruebe, se construye el camino a propósito.

**La lección de método:** las tres lentes leyeron el mismo código verde y las tres encontraron cosas
distintas. El verde de `npm test` dice que lo que se probó pasa, no que lo que importa esté probado
(`30 · L-33`); aquí lo que faltaba probar era, entre otras, **la pieza del contrato que sostiene toda
la ola** — desactivarla dejaba las 1.014 en verde y hacía desaparecer el empalme del mapa.

### Crudo de respaldo

`research-archive/2026-08-16-workflow-mapa-identidad-apoyos.json` (el mapa del terreno, verificado
archivo:línea) · `research-archive/2026-08-16-workflow-identidad-canonica.json` (diseño, construcción
en cadena y las tres lentes adversariales) · fixtures `LN-627-geometria-ampliacion-2026-08.json` (con
el acta de aprobación fechada del 2026-08-16) y `LN-627-falla.json` en la bóveda.

---

## ADR-028 · 2026-08-17 · La carga de puntos se hace DESDE la aplicación: la identidad se acuña en el repositorio y el navegador solo la busca

**Estado:** ✅ Decidido · ⚠️ **NO revisada externamente** *(el estado vivía solo en la tabla de `00`; se trae a su dueño el 21-08).*

### Contexto

Cargar un punto nuevo en la base exigía correr `herramientas/sembrar.mjs` con una **llave de cuenta
de servicio**: una llave maestra que **se salta todas las reglas de Firestore**, que hay que
descargar, custodiar y regenerar cuando se pierde — y ya se perdió una vez (`docs/10`, 06-08). El
Ingeniero lo resumió el 2026-08-17 preguntando *«¿qué llave debo entregarte? si venimos trabajando
desde hace mucho tiempo y nunca habías solicitado llave»*, y al ofrecerle las dos vías eligió:
**«vamos con bien de raíz»**.

Hay un camino mejor y ya estaba abierto: `firestore.rules` permite `create` en `apoyos` a
`esEditor()`, y la web **ya escribe** en la base desde el navegador (análisis RCA, acciones,
sondeos). Escribir con la sesión del Ingeniero **respeta** las reglas; la llave las ignora. Es más
seguro, no menos.

El nudo duro era otro: **el registro de semillas** (`herramientas/semillas-emitidas.json`, ADR-027)
es un archivo del repositorio, y el navegador no puede escribir en el repositorio.

### Decisión

**La identidad se acuña en el repositorio; el navegador solo carga puntos cuyo nombre YA está
anotado en el libro.** El navegador **busca** el identificador, nunca lo calcula ni lo inventa. Si
un nombre no está en el libro, la pantalla se niega y lo dice: *«no se puede estrenar identidad
desde aquí»*. Un nombre nuevo cuesta un commit — ése es el precio, y se paga una vez por
levantamiento, no por punto.

Además:
- **Quinto workspace `importar/`**, hermano de `exportar/`: leer el GPX · buscar en el registro ·
  construir UN punto (jamás reconstruir los 26) · calcular el antes/después con el motor que ya
  existe. Sin `node:` nada, sin criptografía: se prueba entero y corre en el navegador.
- **Pestaña «Cargar»**, visible solo con rol de administrador. Cinco preguntas por punto, **ninguna
  preseleccionada**, la casilla de aprobación **vacía**, el antes/después en cifras antes de que
  exista ningún botón, confirmación en frío, y un acta descargable con el porqué de cada decisión.
- **`herramientas/` no se toca**: el sembrador con llave sigue existiendo para lo que la pantalla no
  cubre (ver Consecuencias).

### Alternativas descartadas (nueve vetos del crítico; se aceptaron enteros)

Las tres que gobiernan: **(1)** que el navegador llamara a `construirApoyos` —reconstruye los 26 y
puede pisarlos—; en su lugar `construirPuntoNuevo`, que **solo añade**. **(2)** Mover el registro a
una colección de la base: serían **dos fuentes de identidad** que solo convergen si alguien corre un
script, y las fotos acabarían colgando de la equivocada. **(3)** Que el sistema **propusiera** en qué
vano cae un punto o su nombre canónico: es un dictamen disfrazado de sugerencia sobre un acto sin
deshacer. Se enseñan distancias crudas y decide él.

### Los dos fallos FATALES que la auditoría cazó con todo en verde

1. **La lectura previa que la base deniega.** Antes de escribir se preguntaba con `getDoc` si el
   punto ya existía. `puedeLeer()` decide mirando `resource.data.orgId`, y **en un documento que aún
   no existe no hay `resource`**: la base no contesta «no está», **deniega**. Como el caso normal es
   cargar puntos que no existen, fallaba **siempre**, en el primero, con «Missing or insufficient
   permissions» en inglés — dos líneas debajo de donde la pantalla acababa de decir que el permiso
   era de administrador. Hoy se comprueba contra los apoyos que la aplicación **ya tiene en
   memoria**, y queda la red de la propia base: `noTocaReservados()` rechaza un `set` que traiga otro
   `creadoEn` sobre un documento existente.
2. **La recarga que destruía el acuse.** Al terminar, se releía la línea en un `finally`. `abrir()`
   pone la fase «cargando», y en esa fase `App.tsx` **sustituye la pantalla entera**: el acuse de qué
   entró, qué quedó fuera y por qué, y el botón del acta se borraban **en el mismo instante en que se
   generaban**. Sobre unos apoyos que no se pueden borrar ni corregir, el Ingeniero se quedaba sin
   ningún papel. Hoy la línea se refresca **cuando él lo pide**, con un botón, después de leer el
   acuse.

Los dos fallaban **en verde**: 1.206 pruebas, contrato y build correctos, y la pantalla 0 %
funcional. Es `30 · L-51` otra vez —«hecho» es lo que se ve— y `30 · L-33`: las pruebas comprobaban
las piezas, ninguna el ciclo completo.

### Consecuencias

- El trámite semanal —cargar puntos— deja de necesitar llave. Los puntos llevan como autor **al
  Ingeniero**, no a «sembrador».
- **Desaparece por construcción una clase de fallo**: ya no hay que afirmar a mano que el contrato
  está desplegado, porque quien escribe es el mismo programa que después lee.
- **La llave NO se retira.** Sigue siendo obligatoria para: dar de alta personas y ponerles rol
  (`setCustomUserClaims` no tiene equivalente de cliente) · corregir o borrar cualquier cosa (todas
  las colecciones de activos niegan `delete`) · subir fotos · sembrar una línea nueva desde cero.
- **Sin verificar en vivo**: que la cuenta del Ingeniero traiga realmente `rol: admin` no se ha
  comprobado nunca contra producción — la aplicación no leía el rol en ningún sitio. La cabecera de
  la pantalla nueva existe justo para eso, y es la primera comprobación del despliegue.
- El punto que va **antes** del primero (el pórtico del extremo de origen) sigue sin camino, a
  propósito, y la pantalla lo dice en vez de intentarlo.

**NO revisada externamente.**

### Crudo de respaldo

`research-archive/2026-08-17-workflow-importar-en-la-app.json` (reconocimiento, dos propuestas, el
crítico con veto y el plan) · `research-archive/2026-08-17-workflow-construir-cargar.json`
(construcción en cadena y las tres lentes adversariales, incluidas las dos pasadas).

---

## ADR-029 · 2026-08-17 · RECORDAR no es PROPONER: la pantalla le devuelve lo que él ya firmó, con la fecha pegada

**Estado:** ✅ Decidido · ⚠️ **NO revisada externamente** *(el estado vivía solo en la tabla de `00`; se trae a su dueño el 21-08).*

### Contexto

La pestaña «Cargar» (ADR-028) parte del GPX **crudo** y no conoce nada anterior: le volvería a
preguntar las cinco cosas de cada punto, **incluida la que confirmó el día antes**. El Ingeniero lo
señaló él mismo: había confirmado el pórtico del extremo FINAL y el empalme nuevo, y lo único
pendiente era el pórtico del extremo de ORIGEN (lo dijo nombrando las subestaciones; aquí no se
escriben). Y tenía razón: sus tres
decisiones están tomadas y **fechadas** en el fixture de la bóveda desde el 16-08 (la del papel
Terminal del pórtico del extremo final, del 17-08). En un sistema cuyo oficio es *hacerle barato
comprobar que tiene razón*, hacerle repetir decisiones ya firmadas es exactamente lo contrario.

El nudo: **el navegador no puede leer la bóveda**, y el repositorio es PÚBLICO con la regla dura de
cero bytes de cliente.

### Decisión

**Un libro de decisiones en el repositorio público, que la aplicación solo LEE, y una pantalla que
jamás pinta un valor recordado sin la fecha que lo respalda.**

- **`herramientas/decisiones-firmadas.json`** — un solo archivo hermano del libro de identidad,
  indexado por línea. **No se autora a mano:** es un extracto REDACTADO del fixture de la bóveda que
  produce `herramientas/publicar-decisiones.mjs` con **lista blanca** de campos. La bóveda sigue
  siendo el único sitio donde una decisión se escribe por primera vez, y `sembrar.mjs` /
  `construir-apoyos.mjs` la siguen leyendo de allí: una sola dirección, bóveda → extracto →
  navegador, sin ciclo y sin segunda autoría.
- **Es un LIBRO MAYOR, no un diccionario.** `decisiones` es un array de filas fechadas: cambiar de
  opinión **apenda**, nunca pisa. Manda la última fechada sobre ese nombre; las anteriores se quedan
  porque son hechos. `pendientes` va en una lista aparte a propósito, para que el código que rellena
  fichas no pueda tocarla ni por un `filter` mal escrito.
- **Precedencia declarada: CARGADO manda sobre FIRMADO.** La pantalla solo consulta el libro para
  nombres que siguen disponibles en el libro de identidad.
- **`importar/decisiones.js`** (lector puro, sin `node:`) + **`web/src/datos/registroDecisiones.ts`**
  (la única línea que trae el archivo, calcada de `registroSemillas.ts`).
- **La pantalla:** bloque de cabecera con lo ya decidido · sello pegado a cada campo recordado con su
  «Cambiar» al lado · aviso escrito cuando se aparta de lo que firmó · bloque del punto pendiente sin
  casilla y sin botón · línea de cierre en el acuse · y el acta llevando **las dos cosas**, lo que
  ratificó y en qué cambió.

### La distinción, escrita para el que venga

    PROPONER = el sistema deduce algo y lo deja marcado.        PROHIBIDO — sigue vetado.
    RECORDAR = él lo decidió, con fecha y con firma, y la pantalla se lo devuelve
               para que lo RATIFIQUE o lo cambie.

**El veto de ADR-028 no se reabre.** Aquí no se deduce el papel estructural, ni el nombre canónico,
ni en qué vano cae un punto: si no hay decisión suya bajo ese nombre, el campo se queda **vacío**,
igual que antes. Y **las dos preguntas que él contesta siempre no se heredan jamás**:

1. **«¿Cuál de sus puntos es éste?»** — es la que abre la puerta a las otras cuatro. Si se dedujera,
   las demás se rellenarían solas desde una deducción del sistema **vestida con la fecha de él**. El
   sistema no empareja: no por el nombre que grabó el aparato (dato del levantamiento, y ya se
   equivocó una vez) ni por cercanía (±8 m; ordenar por distancia es un dictamen disfrazado de
   lista). El recuerdo lo dispara SU elección.
2. **La aprobación.** Aprobar es el ACTO irreversible; el recuerdo es memoria de una intención. La
   casilla empieza vacía **siempre**, aunque el libro diga «aprobado», y la pantalla lo dice con esas
   palabras.

### Alternativas descartadas

- **(b) Meter las decisiones dentro de `semillas-emitidas.json`.** La peor, y por un motivo mecánico:
  `identidad.js:nombresDelRegistro` recorre `Object.keys` de la página y solo descarta las que
  empiezan por `_`; una clave `decisiones` se convertiría en un **nombre canónico del desplegable**.
  Y de fondo: ese archivo declara que una fila escrita NO SE TOCA JAMÁS porque sostiene 99 fotos y un
  expediente; las decisiones son revisables y apendables. Dos ciclos de vida en las mismas filas
  dejan al archivo sin poder enunciar ninguno de los dos invariantes.
- **(c) Una colección en la base.** Reabre la alternativa #2 ya vetada en ADR-028 (dos fuentes que
  solo convergen si alguien corre un script) y tiene un problema de arranque sin salida. Pero lo que
  la mata es otra cosa: **una colección la puede escribir la aplicación, y quien puede escribir el
  recuerdo puede FABRICARLO** — «decidido por usted el 16 de agosto» dejaría de ser verificable y
  pasaría a ser una afirmación del sistema sobre sí mismo. Un archivo del repositorio solo cambia con
  un commit, con autor y con diff. La memoria tiene que ser **infalsificable por la pantalla que la
  enseña**; solo el repositorio lo cumple.
- **(d) Que el Ingeniero aporte también el archivo.** Es devolverle el problema —él no programa—,
  pero hay un motivo más duro: un archivo de decisiones que entra por el navegador es un archivo que
  la aplicación no ha verificado contra el libro de identidad. Sería el camino por el que un error de
  copia le pone su firma y su fecha a una decisión que nunca tomó, sobre un acto sin deshacer.
- **Preseleccionar la casilla de aprobación** cuando el libro dice que él ya aprobó ese punto. Se
  descartó: es la única de las cinco cuyo efecto no se puede deshacer, y un acto no se hereda de un
  recuerdo. Lo que sí se hace es enseñarle, con su fecha, que aquel día lo aprobó — y dejar que el
  clic de hoy sea suyo.

### Lo que hay que decir con estas palabras, porque el próximo no lo va a deducir

1. **La prueba de no-fuga es una LISTA NEGRA de formas, y las listas negras se quedan cortas.** La
   defensa primaria es la **lista blanca** del generador, que además compara lo emitido contra la
   bóveda de verdad — algo que ninguna prueba del repositorio puede hacer, porque en CI la bóveda no
   está montada. Que el test esté verde **no autoriza a confiarle el archivo**.
2. **La pendiente resbaladiza es el riesgo de fondo.** Hoy el archivo lleva lo que él decidió; el día
   que alguien meta ahí una fila que el sistema **dedujo** y la pantalla la enseñe con fecha,
   tendremos un dictamen con sello — **peor que el que ADR-028 vetó, porque parece firmado**. La
   guardia es que el generador solo lee campos que él autoró, exige `decididoPor` y `decididoEn` para
   emitir una fila, y exige prosa escrita a mano para cada punto.
3. **Rellenar cuatro de cinco respuestas debilita el diseño anti-ancla de ADR-028**, y eso sigue
   siendo verdad aunque el campo sea suyo: un campo ya puesto se confirma en vez de decidirse.
   Mitigado con la pregunta 1 y la casilla nunca recordadas, el sello y el «Cambiar» pegados a cada
   campo, y las distancias crudas intactas en pantalla. **Riesgo residual real: puede ratificar sin
   releer.** Se acepta porque repetir lo ya firmado tiene su propio coste — repetir es donde se
   cambia una respuesta por cansancio.

### Consecuencias

- Cargar los dos puntos de agosto deja de exigirle contestar de nuevo lo que firmó el 16 y el 17.
- **Deriva bóveda↔repo sin red en CI:** el extracto se genera en local y CI no puede compararlo con
  la bóveda. En la máquina del Ingeniero sí: la prueba «regenerar da exactamente el archivo
  commiteado» se pone roja. Residual declarado: si alguien edita el JSON a mano, en CI no se entera
  nadie. Es la misma limitación que `semillas-emitidas.json` ya acepta y declara.
- **Divergencia después de cargar:** si el día de la carga cambia algo, manda lo de hoy y el acta
  recoge las dos cosas, pero **la fila del libro queda desactualizada hasta que alguien apende la
  nueva por commit, y nada obliga a hacerlo.** La constancia inmediata es el acta descargable.
- **El nombre del pendiente entra al repo público sin semilla emitida.** No otorga identidad y no lo
  hace cargable, pero invita a que alguien lo emita para «completar» el libro saltándose la
  verificación de campo que él pidió. La prueba que exige que los nombres de `pendientes` NO estén en
  el libro de identidad se pone roja ese día, obligando a que la decisión sea explícita.
- **Sin verificar en vivo:** la pantalla nueva no se ha visto todavía contra producción con el
  Chrome del Ingeniero.

**NO revisada externamente.**

### Crudo de respaldo

`research-archive/2026-08-17-workflow-recordar-no-proponer.json` (la decisión de dónde vive el libro
con su argumentación en contra, la lista blanca campo por campo, y la construcción en dos eslabones).

---

## ADR-030 · 2026-08-17 · La ficha estructural se puede ESCRIBIR: seis campos, procedencia por campo y el antes/después antes de guardar

**Estado:** ✅ Decidido · ⚠️ **NO revisada externamente** · ⬜ **sin verificar en vivo** (la pantalla
no se ha visto todavía contra producción con el Chrome del Ingeniero).

### Contexto

`docs/05` declara la misión —«cerrar el hueco del DATO, no el del código»— y el hueco tenía nombre:
**0 de 24 apoyos con veredicto, en los dos ejes**. No era un fallo del cálculo. `nucleo/cargas.js` y
`nucleo/longitudinal.js` saben dictaminar desde hace meses; lo que no existía era **por dónde meter
el dato**. La ficha de un apoyo mostraba unos 12 campos de los ~28 del contrato y **todos de solo
lectura**: desde la pantalla no se podía escribir absolutamente nada (`TODO-57`).

El Ingeniero lo dijo comparando con el módulo original: «faltan muchas cosas que antes se podían».

### Decisión

**Entran SEIS campos, ni uno más, y cada uno entra porque sin él un apoyo NO puede tener veredicto**
— leído en el motor, no supuesto: altura libre sobre el terreno · altura del amarre del conductor ·
carga de rotura en la punta · capacidad a lo largo de la línea (los cuatro datos juntos) ·
conductores que amarran · tipo de apoyo. El sexto no desbloquea por sí solo y entra porque es la
clave por la que se agrupa un lote y sin él una carga de rotura aplicada a varios apoyos no tiene
criterio defendible.

**Quedan fuera con motivo, no por falta de tiempo:** `altura_m` (no desbloquea nada y es justo el
campo con el que se confunde la altura libre — se sigue MOSTRANDO, en gris, con la frase que explica
la diferencia) · `cotaSujecion_m` (alimenta el vano peso, deuda declarada sin contrastar, `40 §8`) ·
`anioInstalacion` y `codigoInventario` (administrativos) · `aislamiento` y `puestaTierra` (dan
veredicto de OTRA familia: ola 2, y la resistencia entra con `medidaEn` obligatoria o no entra) ·
`condicion` (es un HECHO FECHADO de una inspección, no una propiedad que se sobrescribe: editarla
aquí borraría el historial de deterioro) · `funcionEstructural` (es lo único que corta tramos y sí
recalcula la línea entera: merece su propia ola con su propio antes/después, no ir de polizón).

**LA PROCEDENCIA SE DECLARA POR CAMPO Y SE CAPTURA POR BLOQUE.** Preguntar una sola vez por ficha
sería mentir: la altura libre se mide en el sitio y la carga de rotura se lee de una placa, y el día
que se firme el informe esas dos cosas no valen lo mismo. Tres bloques que copian **cómo llega el
dato de verdad** —lo que se mide en el sitio · lo que dice la placa o el plano · lo que se cuenta
mirando el apoyo—, cada uno con un selector de cabecera que sella sus campos de un gesto; cada campo
enseña su sello y se cambia suelto.

**La regla dura no se cumple en la pantalla: se cumple en el molde.** `FichaEstructural` (contrato,
`strict` + `superRefine`) rechaza un valor sin su sello ANTES de que salga del navegador. El selector
arranca VACÍO y `confirmado_humano` **no está en la lista**: confirmar no es un origen, es un ACTO
POSTERIOR sobre un dato que ya está.

**EL ANTES/DESPUÉS SE ENSEÑA ANTES DE GUARDAR, SOBRE EL TRAMO ENTERO** (ADR-002). Se calcula con los
valores pendientes, apoyo por apoyo del tramo, con las cifras que importan arriba: cuántos ganan
veredicto, **cuántos lo pierden** y cuántos pasan a REVISAR — con la frase que evita el peor efecto
posible de esta ola: «esto no es una avería nueva: es lo que ya pasaba y hasta hoy no se podía ver».
Y lo que NO se mueve se dice con todas las letras: un panel callado se lee como «no lo miré».

**TRES COMPROBACIONES DE GEOMETRÍA EN VIVO**, porque `nucleo/longitudinal.js` devuelve `null` **en
silencio** en esos tres casos: sin el aviso, él declararía cuatro números impecables, no vería
ningún veredicto y concluiría que la herramienta está rota. La regla tiene **un solo dueño**
(`web/src/vistas/fichaEstructural.ts`) y una prueba la ata al núcleo llamándolo de verdad.

**Solo escribe quien tiene permiso de edición, y si no lo tiene la ficha se VE y se dice por qué.**
Leer nunca se bloquea. Es higiene, no la frontera: la frontera son las reglas de la base, que además
ganaron el cerrojo de revisión en el eslabón anterior.

### Alternativas descartadas

- **Devolver en el formulario los valores que el apoyo ya tiene.** Es lo natural en un editor y aquí
  es un fallo: el valor y su sello entran JUNTOS, así que prerrellenar obligaría a volver a declarar
  el origen de todo — o, peor, a **resellar con la fecha de hoy un dato que alguien midió en marzo**.
  El formulario arranca vacío y lo guardado se ENSEÑA al lado, con su origen.
- **Preguntar la procedencia una vez por ficha.** Más barato de teclear y falso: mezcla en un solo
  sello lo medido y lo leído de una placa.
- **Escribir las reglas de «qué falta» en el formulario.** Serían dos dueños de la misma regla. Viven
  en el módulo puro, y una prueba comprueba que lo que la pantalla acepta el molde lo acepta y lo que
  la pantalla nombra como falta el molde también lo rechaza.
- **Un botón «Confirmo este dato» en esta ola.** NO se implementó, y no por tiempo: `FichaEstructural`
  rechaza `confirmado_humano` por diseño y rechaza un sello sin valor, así que ese segundo gesto
  necesita **su propio camino de escritura**. Un botón que no escribiera nada sería peor que su
  ausencia. La pantalla declara el hueco con la frase que importa: «un dato que solo leyó de un plano
  no está confirmado: está documentado».
- **Recargar la línea al guardar.** Destruiría el acuse en el instante en que se genera — la lección
  ya está escrita en `refrescarLinea` (ADR-028) y se ejecuta, no se repite: la línea se relee cuando
  él pulsa «Ver la línea recalculada».

### Consecuencias

- **El cuello de botella se abre.** Por primera vez un apoyo puede pasar de «sin veredicto» a tener
  veredicto sin tocar la base a mano. `TODO-57` deja de estar bloqueado por el código y pasa a
  depender del DATO: qué tiene la empresa en planos y actas, y qué hay que levantar en campo.
- **Los primeros veredictos van a traer «REVISAR».** Es lo que ya pasaba y no se veía. Si esa frase
  no acompañara a la cifra, el efecto sería que se deja de meter datos — justo lo contrario de lo que
  busca esta ola.
- **`vistas/ejesLinea.ts` gana `contextoDeLinea`**, que arma las DOS formas de tramo que el núcleo
  pide. Sigue siendo el dueño único: montar los tramos en la pestaña Fichas habría creado la segunda
  fuente contra la que avisa su propia cabecera, y pasarle la forma aplanada al eje longitudinal **no
  da error** — deja el eje mudo.
- **La ficha gana dos filas que el contrato admitía y ninguna pantalla enseñaba:** la capacidad a lo
  largo de la línea y los conductores que amarran. Un dato que se puede guardar y no se ve es un dato
  que nadie puede discutir.
- **DEUDA DECLARADA, y es la peligrosa: `exportar/acta.js` todavía NO arrastra la procedencia ni
  marca los veredictos calculados sobre datos supuestos.** La pantalla ya los marca en los dos sitios
  donde puede hacer daño —junto al dato y junto al veredicto— y el módulo puro expone `datosSupuestos()`
  y `avisoDeSupuestos()` listos para que el acta los use. Mientras no entre, **un «cumple» calculado
  sobre una altura estimada a ojo puede salir limpio en un papel**. Es lo primero de la ola 3.
- **El LOTE no entra en esta ola.** La escritura ya existe y ya trae sus salvaguardas
  (`guardarFichaApoyoEnLote`: solo los tres campos del MODELO, solo estructuras, solo rellena huecos,
  administrador, atómico); lo que falta es su pantalla. La ficha declara la ausencia en vez de
  fingirla, con la frase permanente de por qué la altura libre, la del amarre y las fases amarradas
  **no van por lote nunca**.
- **Sigue vivo el riesgo del sembrador** (`herramientas/sembrar.mjs:106` mete `revision: 0` y la 307
  hace `set(..., {merge:true})` con SDK de administrador): sembrar sobre un apoyo ya editado lo
  devuelve a revisión 0 en silencio, y el siguiente guardado fallaría con el mensaje de «otra persona
  guardó cambios» sin que hubiera ninguna otra persona. Hay que decidir si el sembrador respeta la
  revisión o deja de tocar apoyos ya editados.
- **Desplegar la web ANTES de escribir el primer dato.** `documento_proyecto` es un valor NUEVO del
  catálogo y el cambio es de UNA SOLA DIRECCIÓN: un apoyo guardado con ese valor no valida contra un
  bundle con el contrato anterior y **se descarta en silencio**. Es la misma trampa del `orden`
  fraccionario de 0.5.0.

### Crudo de respaldo

*(sin comité: el diseño lo cerró el Ingeniero campo por campo antes de construir, y la construcción
fue en eslabones. La evidencia reproducible son las pruebas: `tests/ficha-estructural.test.js` (41)
y `tests/ficha-editable.test.js` (41), con mundo sintético.)*

---

## ADR-031 · 2026-08-17 · Las fotos se suben DESDE la aplicación; el portero deja de ser solo-lectura bajo diez cerrojos

**Estado:** ✅ Decidido · ⚠️ **NO revisada externamente** · ✅ **VERIFICADO EN VIVO el 2026-08-17**.

> **Actualización de estado (21-08).** Esta cabecera dijo hasta hoy *«sin verificar en vivo… ni ha
> entrado una sola foto por esta vía»*, y llevaba cuatro días siendo falsa: las **106 que faltaban
> entraron por esta pestaña** con la sesión del Ingeniero y las **205 se ven** en la galería. Quedan
> **tres defectos vivos que NO bloquean**: el acuse cuenta mal, el mapa de carpetas solo se acepta
> como objeto y el guardián de orden da un falso positivo. Se corrige el estado en vez de reescribir
> el cuerpo: un ADR se apenda (`CLAUDE.md §2`). Lo cazó la auditoría del cerebro del 21-08.

### Contexto

El 17-08 (ADR-028) los PUNTOS empezaron a entrar desde la aplicación, con la sesión y el rol. Las
FOTOS no. La única vía seguía siendo `herramientas/subir-evidencias.mjs`, un guion de consola que
exige `GOOGLE_APPLICATION_CREDENTIALS` — la llave maestra, que se salta todas las reglas de
Firestore, hay que custodiarla y ya se perdió una vez. En campo, con el teléfono en la mano, no
existe.

En la bóveda hay 205 fotos convertidas a JPG de 28 puntos. 99 ya están cargadas en producción y
ninguna cuelga del apoyo equivocado (comprobado por tres caminos contra la base). Faltan 106.

### La decisión cara: quién firma la subida al depósito

**EL MISMO PORTERO, CON EL MISMO TOKEN DE LA SESIÓN.** Se le añade **una** ruta de escritura,
`PUT /e/<clave>`. Ni `DELETE`, ni `LIST`, ni ninguna otra.

**El argumento que decide: no añade ni una credencial nueva.** El depósito YA está expuesto entero
al portero — `evidencias/wrangler.toml` lo dice con todas las letras desde §ADR-013: un
`[[r2_buckets]]` **no tiene modo de solo lectura**, el binding expone el `R2Bucket` completo con
`put`, `delete` y `list`; que el trabajador solo llamara a `.get()` era una **costumbre del código,
no un permiso de la plataforma**. Aceptar subidas no abre una puerta: usa la que ya estaba abierta
desde dentro, y sigue habiendo **una sola llave para entrar** (la firma del token de Google
verificada contra sus llaves públicas).

**Coste verificado, no recordado** (`30 · L-09`): Workers plan gratuito 100.000 peticiones/día,
10 ms de CPU por invocación, cuerpo hasta 100 MB; al pasarse devuelve Error 1027 y **no factura**,
apaga. R2 gratis para siempre: 10 GB-mes, 1 M operaciones Clase A/mes, 10 M Clase B/mes, salida
gratis. `PutObject` es Clase A, `GetObject`/`HeadObject` Clase B. Las 106 fotos = 106 A + 106 B: el
0,01 % del cupo mensual y el 0,2 % del cupo diario. **Un solo Worker, cero líneas de factura nuevas.**

### Los diez cerrojos (todos en `evidencias/src/index.js`, todos probados sin red)

1. Sin `PROYECTO_FIREBASE` u `ORG_PERMITIDA` → 503, el servicio **se apaga**. No se relaja ni un byte.
2. Solo `GET`, `PUT` y `OPTIONS`, por **lista blanca**. Cualquier otro método → 405.
3. Token verificado igual que hoy + `orgId` correcto + **`rol ∈ {admin, editor, cuadrilla}`**. Sin
   reclamo `rol`, o con otro, no pasa: falla **cerrado**, igual que ya hacía el `orgId`.
4. La clave tiene que casar una **forma estricta** (`<línea>/<origen>/<12 hex>-<archivo>.<ext>`).
   Nada de rutas libres; el control de `..` se queda.
5. `content-type` en lista blanca **y coherente con la extensión**.
6. `content-length` presente y entre 1 byte y 25 MB. Ausente → 411.
7. Cabecera `x-huella` con el sha256 completo; sus 12 primeros caracteres tienen que ser el prefijo
   de la clave, y el hash entero se le pasa a `put(..., { sha256 })` para que **R2 mismo** rechace un
   cuerpo que no case. **El cliente no elige qué objeto pisa**: para pisar otro habría que fabricar
   una colisión de sha256.
8. `head(clave)` primero. Si el objeto está → 200 `{ya:true}` y **no se escribe**. El portero nunca
   sobrescribe. (`head`, no la escritura condicional: el comodín «solo si no existe» **no está
   documentado** para el binding, y aquí no se diseña sobre lo no documentado.)
9. El cuerpo va **en chorro**. Prohibido `arrayBuffer()` y prohibido calcular el hash dentro del
   Worker: eso se comería los 10 ms de CPU con una foto de 5 MB. La integridad la comprueba R2.
10. La respuesta no devuelve nada del depósito salvo la clave que le mandaron.

Y un **guardián por texto** en `tests/portero.test.js`: si `.delete(` o `.list(` aparecen en ese
archivo, la prueba se pone roja. Es lo que convierte la costumbre en barrera.

### Los tres caminos descartados

**(B) URL firmada de corta vida (S3 presignada).** Es la que más parece «lo profesional». Dinero:
cero también. Descartada porque exige **crear un token de API de R2** —una credencial nueva y de
larga vida: quien la saque escribe en el depósito entero durante meses, sin token de Firebase y sin
sesión— y exige **abrir CORS en el propio depósito**, dejándolo MÁS abierto que hoy, que es
exactamente la línea roja del encargo. Además una URL firmada es un **pase al portador**: mientras
vive funciona sin sesión, sin `orgId` y sin `rol`; se reenvía por chat y sigue sirviendo. Y obliga a
meter firma SigV4 dentro del Worker, código criptográfico nuevo en la única pieza de servidor que hay.

**(C) Un segundo Worker o Pages Functions.** Descartada por doctrina explícita (`CLAUDE.md §1`, «un
Worker y solo uno») y porque duplicaría la verificación del token en dos sitios que pueden divergir.

**(D) Seguir como hoy.** Descartada porque es el problema, no la solución. **No se retira**:
`subir-evidencias.mjs` sigue existiendo y funcionando para lo que la pantalla no cubra.

### Cómo se ata cada foto a su apoyo

**LA CADENA, y ningún eslabón es una posición:** archivo → *(índice del registro, en la bóveda)* →
CARPETA → *(mapa de carpetas, en la bóveda)* → NOMBRE CANÓNICO → *(casado EXACTO contra
`nombreNormalizado` del apoyo que YA está en la base)* → **se copia SU `id` tal cual**. Es la
lección de §ADR-015 y §ADR-027.

El mapa **no puede vivir en el repositorio**: una de esas carpetas lleva el nombre de una instalación
del cliente (`33 · L-50`). Vive en la bóveda, y es **el mismo documento que lee la máquina**: él lo
elige con el selector, la pantalla lo pinta como la tabla de reparto, el objeto que pinta es
literalmente el que se le pasa al emparejador, y «Guardar el mapa de carpetas» descarga el MISMO
JSON con la MISMA forma que ya lee el guion de consola. **Un documento, dos lectores.**

El emparejador se muda a `importar/evidencias.js` (`@lineas/importar/evidencias`), puro y sin `node:`
nada, y `herramientas/resolver-evidencias.mjs` queda como reenvío fino. **Una implementación, dos
lectores** — el guion y la pantalla.

### Los cuatro fallos del intento anterior, verificados CORRIENDO, no leyendo

1. **El eslabón suelto.** `resolverCarpetas` estaba exportado y probado y **no lo llamaba nadie**: el
   guion leía del índice un campo `nombreCanonico` que el índice no tiene. Salida real: **205
   problemas `foto-sin-canonico`**, siempre, en la primera corrida. Un eslabón que nadie enlaza no es
   media solución: es cero.
2. **El guardián que saltaba con la corrida buena.** El control anti-transposición exigía que el
   `orden` saliera creciente **según iban apareciendo los archivos** — y las fotos van ordenadas por
   nombre en una carpeta plana, que no es un recorrido. Salida real: **1 falso positivo sobre 28
   grupos**. Ahora mira el orden de las **filas del mapa**, que es donde de verdad se cruzan dos filas.
3. **El `--origen` mal escrito que apagaba la asignación en silencio.** `EXIGE_APOYO = ORIGEN ===
   'estructuras'`: con `--origen registro-2026-08` valía `false` y las 205 fotos habrían subido **sin
   apoyo, sin un solo aviso**. Invertido: se exige siempre y solo lo apaga `--sin-apoyo`.
4. **Revisar exigía la llave maestra.** En `--seco` abortaba sin credencial, o sea que el paso «que lo
   revise una persona antes» era justo el que pedía la llave que se quiere dejar de usar. Ahora en
   seco se enseña la cadena carpeta → punto y **se dice qué parte no se pudo comprobar**.

### La excepción al veto de ADR-028, declarada en voz alta

ADR-028 dice: **el navegador solo busca, jamás acuña**. Ese veto **sigue entero para lo que
protege**: la identidad de un PUNTO. Lo que se abre es el id de una **evidencia**, que sale de la
HUELLA del archivo — un hecho medible del binario sobre el que nadie puede discrepar, sin nada que
anotar en un libro ni nada que firmar. Y es **obligatorio** derivarlo: si no saliera de la huella,
repetir una subida cortada crearía fichas duplicadas de la misma foto, y las reglas prohíben borrarlas.

El peligro no es acuñar: es que existan **dos fórmulas**. `herramientas/identidad.mjs` usa
`node:crypto`; `importar/identidad.js` usa `crypto.subtle` (idéntica en Node 22 y en el navegador).
Se paga con una **prueba de oro** que exige que las dos den exactamente lo mismo, más **vectores
fijos** escritos a mano para que tampoco puedan derivar juntas, más un guardián que prohíbe que la
semilla de un PUNTO aparezca fuera del repositorio.

### Lo ya subido: se pregunta por lo que EXISTE, nunca por lo que no existe

Es toda la diferencia con el fallo del 17-08 (§ADR-028, «los dos fallos FATALES», #1): `getDoc` sobre
un documento que aún no existe no devuelve «no está» — `puedeLeer()` mira `resource.data.orgId` y sin
`resource` **DENIEGA**. Cuatro redes, y ninguna hace esa pregunta:

1. **La lista que la aplicación ya tiene en memoria**, traída por una CONSULTA (`where orgId`, `where
   lineaId`). Una consulta devuelve lo que hay. Coste: cero peticiones nuevas.
2. **La huella se recalcula en el navegador**, del archivo real. El `sha256` del índice sirve para
   pintar la tabla rápido; si alguien reconvirtió una foto y no regeneró el índice, ese hash miente.
3. **El portero**, `head` antes de escribir. Una operación Clase B de los 10 M mensuales.
4. **La idempotencia de la propia clave**: la clave lleva la huella y el id se deriva de la huella.
   La misma foto cae en la MISMA clave y en el MISMO documento.

**Lo que NO cuenta como prueba: la columna `yaCargado` del mapa.** Es una anotación humana, útil para
pintar. Quien decide es el hash contra la base.

### La pantalla: pestaña propia, no dentro de la galería

Se consideró colgarla de la galería de cada ficha. Descartada porque **la seguridad de este diseño
vive en ver las 28 filas a la vez**: un desfase se ve porque la fila de al lado no cuadra, no mirando
una fila sola. Dentro de la ficha habría que elegir el apoyo PRIMERO, y entonces el sistema ya no
puede enseñar nada que contradiga la elección. Además el acto es de LÍNEA (205 fotos, 28 puntos), y
«Cargar» ya sentó la regla: lo que escribe va en su propia pestaña, al final, con el permiso dicho
antes de empezar.

**No es `soloAdmin`**, a diferencia de «Cargar»: quien va a campo con el teléfono es la cuadrilla, y
es lo que `firestore.rules` permite para evidencias (`esCuadrilla()`). Esconderla sería esconderla a
quien tiene que usarla. Quien no pueda subir la ve y **la pantalla se lo dice**.

Seis pasos, y hasta el quinto no sale un solo byte del computador: elegir · el reparto (tabla
editable, con desplegable cargado con los puntos que YA están en la base) · las paradas · confirmar
en frío (casilla vacía + escribir SUBIR) · el progreso · **el acuse, que NO se borra solo** — la
línea se refresca cuando él lo pida, después de leer. Es la cicatriz de ADR-028, donde el refresco
automático destruyó el acuse en el instante en que se generaba.

### Lo que hay que saber, sin adornos

- **El portero dejó de ser solo-lectura, y eso es irreversible en la práctica.** Un fallo de lectura
  filtra; uno de escritura **ensucia para siempre**: `firestore.rules:120` prohíbe borrar evidencias
  y un objeto mal metido en R2 solo lo saca el Ingeniero a mano con wrangler.
- **El cupo diario lo comparten galería y subida.** Agotarlo devuelve Error 1027 y deja la galería a
  oscuras hasta medianoche UTC. No factura: apaga. 106 fotos son el 0,2 % del cupo, así que el
  escenario es inverosímil; se declara igual porque un límite compartido no descubierto a tiempo es
  una caída sin explicación.
- **El AUTOR de las fichas cambia.** Las 99 ya escritas llevan `creadoPor: 'subidor'` (llave
  maestra); las nuevas llevarán el identificador de la sesión, porque `altaCoherente()` lo exige. Es
  aditivo y correcto, pero **cualquier informe que agrupe por autor verá dos valores** para el mismo
  lote de fotos. Se dice antes, no se descubre en un informe.
- **`crypto.subtle` exige contexto seguro.** Funciona en producción y en `localhost`, pero **no** si
  alguien abre la aplicación por la IP de la red local para probar desde el móvil. La pantalla lo
  dice con esas palabras en vez de fallar a medias.
- **Crece la superficie de tanteo.** Hoy un token válido distingue 200 de 404; ahora distinguirá
  además «ya estaba» de «entró». Misma magnitud de fuga, dentro de una sola organización.
- **El reparto lo firma él, y no tiene vuelta.** Ningún cerrojo técnico cubre elegir mal el punto de
  una carpeta: lo cubren la tabla enseñada antes, la casilla vacía, el escribir SUBIR y el aviso en
  rojo. Es la razón de que este diseño gaste tanto en el paso 2 y tan poco en el 5.
- **Un objeto huérfano es posible** si la foto entra y la ficha no. Se sube primero el objeto **a
  propósito**: al revés dejaría una ficha apuntando al vacío, que es lo que la galería enseña como
  error. Un huérfano ocupa unos megas y no lo ve nadie; repetir la subida no lo duplica.

### Fuera de esta ola, dicho para que nadie lo dé por hecho

Captura desde la cámara en campo y cola de subida sin señal · **borrado o listado en el portero
(jamás, ni en olas futuras)** · subida en varias partes o archivos de más de 100 MB · conversión de
HEIC en el navegador (se sigue haciendo en la bóveda) · pie de foto por imagen · prefijo por
organización en las claves · retirar `subir-evidencias.mjs`, que se queda y sigue funcionando.

**Evidencia reproducible:** `tests/portero.test.js` (47) · `tests/evidencias-por-nombre.test.js` (29)
· `tests/fotos-pantalla.test.js` (40) · `tests/identidad-apoyos.test.js` (69, con la prueba de oro).
`npm test` = **1.492**.


## ADR-032 · 2026-08-19 · Un veredicto calculado sobre un dato que nadie verificó lo dice en el papel — y lo dice el MOTOR, no el papel

**Estado:** ✅ Decidido · ⚠️ **NO revisada externamente** · ⬜ **sin verificar en vivo** (no se ha
visto todavía contra producción con el Chrome del Ingeniero).

### Contexto

`ADR-030` dejó abierta, con estas palabras, la deuda más peligrosa de la ola: *«`exportar/acta.js`
todavía NO arrastra la procedencia ni marca los veredictos calculados sobre datos supuestos»*
(`TODO-70` ①). Mientras no entrara, **un «cumple» calculado sobre una altura estimada a ojo salía
limpio en un papel firmado**, indistinguible de uno medido con cinta. Y la ficha se lo había
prometido al Ingeniero con estas palabras, en el selector de origen: *«Lo estimé a ojo → queda
marcado como supuesto. El veredicto saldrá igual, y saldrá diciendo que se calculó sobre un
supuesto.»* Un sistema que promete y no cumple es peor que uno que calla.

**Al abrir el archivo, la deuda era peor de lo que estaba escrito.** `exportar/informe.js` YA tenía
la marca, con su comentario explicando por qué existía, y **una prueba en verde que juraba que
funcionaba**. No marcaba nada, y no podía marcarlo nunca, por tres desajustes simultáneos que en
JavaScript no dan error: leía los sellos de la FILA cuando viven en el APOYO; buscaba
`{origen:'estimado'}` cuando el contrato escribe `{procedencia:'supuesto', fuente, declaradoEn,
declaradoPor}`; y su prueba fabricaba la fila a mano con esa misma forma inventada, así que ensayaba
un camino que la aplicación no recorre. Queda escrito como `33 · L-53`.

### Decisión

**QUIÉN DECIDE QUÉ ESTÁ SUPUESTO ES EL MOTOR.** `nucleo/cargas.js` y `nucleo/longitudinal.js`
publican por fila `supuestosDelVeredicto` —campo, etiqueta y fuente—, y la pantalla, el informe, el
gerencial y el CSV **solo lo pintan**. No es purismo: es el único sitio donde se sabe QUÉ CAMPOS
entraron en cada eje. El transversal come la carga de rotura y las dos alturas; el longitudinal, la
capacidad longitudinal, la altura de amarre y cuántas fases amarran — y **no come la carga de
rotura**, que es ensayo transversal en punta. Una marca deducida en el exporte a partir de
`apoyo.procedencias` señalaría en un eje un dato que solo entró en el otro: **una alarma que salta
cuando no debe se acaba ignorando**, y con ella las de verdad.

**SOLO SE MARCA LO QUE ENTRÓ.** Un campo sellado como supuesto pero VACÍO no se marca: no se calculó
con él, y su hueco ya lo dice `faltaParaVeredicto`. «Lo estimé a ojo» y «no lo tengo» se corrigen en
sitios distintos —uno exige ir a medir, el otro ir a buscar el dato— y mezclarlos manda a la persona
equivocada. Por la misma razón, un conteo de fases heredado de la LÍNEA no arrastra el sello del
apoyo: ese número no salió de ahí, y el criterio ya declara de dónde vino.

**`faltaParaVeredicto` y `supuestosDelVeredicto` salen de UNA sola lista de campos**
(`CAMPOS_DEL_VEREDICTO`). Con dos listas, un campo entraría en una y se olvidaría en la otra sin que
nada avisara — que es la forma exacta en que este proyecto ya perdió una regla (`33 · L-40`).

**LA MARCA VA EN TEXTO VISIBLE, NUNCA EN UN `title=`.** El informe se imprime: en papel un tooltip no
existe. Y va en los DOS sitios donde hace daño — junto al veredicto de cada fila y contado en prosa
ANTES de la tabla, porque quien hojea el informe en una reunión no recorre veinticuatro filas.

**LO QUE NO SE MUEVE SE DICE.** Sin ningún supuesto, el papel escribe que no lo hay: un panel callado
se lee como «no lo miré». La misma doctrina del antes/después de `ADR-030`.

**DÓNDE ENTRA:** informe técnico (los dos ejes, con su cuenta y su entrada en «Lo que este informe NO
demuestra») · informe gerencial (fila propia en COBERTURA y renglón en RIESGO RESIDUAL: es la única
página que lee quien decide) · CSV de verificación mecánica (columna `Datos_supuestos` en los dos
ejes) · pestaña Cargas (las dos tablas).

### Alternativas descartadas

- **Que el exporte deduzca los supuestos de `apoyo.procedencias`.** Es lo que había, y es justo el
  fallo: `exportar/` no puede saber qué comió cada eje sin copiar la regla del motor, y una regla
  copiada empieza igual y termina distinta. Además obligaría a unir fila y apoyo **por el nombre**,
  que no es la identidad de una estructura (`CLAUDE.md §3.1`).
- **Mover `datosSupuestos()` de `web/src/vistas/fichaEstructural.ts` al workspace de exportes.**
  Contestan preguntas distintas y las dos hacen falta: la de la ficha es «de los SEIS campos de esta
  ficha, cuáles nadie verificó» —una propiedad del apoyo, que se pinta en su tarjeta— y la del motor
  es «de los que entraron en ESTE veredicto, cuáles». Fundirlas devolvería las alarmas falsas.
- **Marcar también los apoyos SIN veredicto.** La cuenta que se publica es sobre los que SÍ lo
  tienen: un apoyo sin dictamen no engaña a nadie, y sumarlo inflaría la alarma con casos que no la
  merecen. El dato viaja igualmente en todas las filas, para quien quiera contarlo de otra forma.
- **Insertar `Datos_supuestos` al lado del veredicto en el CSV.** Se lee mejor ahí y se descartó: las
  columnas de ese archivo son un FORMATO y el proyecto no las reordena sin migración. Va al final.

### Consecuencias

- **La promesa de la ficha se cumple en los cuatro sitios donde el veredicto se lee.** Un dato
  estimado a ojo deja de ser indistinguible de uno medido con cinta en el papel que se firma.
- **El acta de carga de puntos (`exportar/acta.js`) no entra, y no por olvido:** ese papel documenta
  una carga de puntos y **no publica ni un veredicto** —sus cifras son estructuras, vanos, tramos y
  longitud—, así que no tiene nada que marcar. Lo que sí marca desde el principio es el papel
  estructural SUPUESTO de cada punto cargado. El día que el acta publique un veredicto, esta marca
  entra con él.
- **La prueba que mentía se reescribió recorriendo el camino REAL:** el apoyo se valida contra el
  molde (`Apoyo.safeParse`) y las filas las produce la misma vista que usa la pestaña Exportar.
  Comprobado por mutación: neutralizando la marca en el motor, la prueba se pone roja.
- **Aditivo, sin migración:** un campo nuevo por fila y una columna nueva al final del CSV. Ningún
  nombre cambia y ningún documento guardado se toca.
- **Se retiró de `nucleo/longitudinal.js` un bloque de tres claves duplicadas** dentro del mismo
  objeto literal del caso Terminal (valores idénticos, sin efecto). Era un pegado accidental.

### Crudo de respaldo

*(sin comité: la deuda venía nombrada y acotada por `ADR-030`, y la parte cara —qué campos come cada
eje— se leyó en el motor, no se deliberó. La evidencia reproducible son las pruebas.)*

**Evidencia reproducible:** `tests/informe.test.js` (3 nuevas, por el camino real) ·
`tests/cargas.test.js` · `tests/longitudinal.test.js` (4 nuevas, con las dos alarmas falsas que NO
deben saltar) · `tests/gerencial.test.js` · `tests/exportar-calculo.test.js`. `npm test` = **1.476**
(contado hoy: `npm test | grep '^ℹ tests'`).


## ADR-033 · 2026-08-19 · El sembrador respeta el cerrojo: lo que escribió una persona no se resiembra

**Estado:** ✅ Decidido · ⚠️ **NO revisada externamente** · ⬜ **sin correr contra la base**
(la regla se prueba entera en el módulo puro; la pasada real necesita la llave de administración,
que hoy no está — ver `10`).

### Contexto

`ADR-030` lo dejó escrito como riesgo vivo: *«`herramientas/sembrar.mjs:106` mete `revision: 0` y la
307 hace `set(..., {merge:true})` con SDK de administrador: sembrar sobre un apoyo ya editado lo
devuelve a revisión 0 en silencio, y el siguiente guardado fallaría con el mensaje de "otra persona
guardó cambios" sin que hubiera ninguna otra persona. Hay que decidir si el sembrador respeta la
revisión o deja de tocar apoyos ya editados.»* Es `TODO-70` ④, y **empieza a doler justo ahora**: el
cuello de botella es que el Ingeniero meta las fichas (`TODO-57`), y el primer apoyo que edite es el
primero que este defecto puede romper.

El daño no es sólo la alarma falsa. `revision` es el cerrojo optimista que compara
`web/src/datos/firestore.ts` antes de escribir; una revisión que va **hacia atrás** deja de detectar
el choque de verdad. Y un cerrojo que da alarmas falsas se acaba desactivando.

### Decisión

**Se lee antes de escribir, y de lo que ya existe no se pisan tres campos:** `revision`, `creadoEn` y
`creadoPor` (`CAMPOS_QUE_NO_SE_RESIEMBRAN`). En su lugar se estampa `actualizadoEn` /
`actualizadoPor`, que es lo que de verdad hizo el sembrador.

**Los otros dos campos entran en la misma regla y no por simetría:** volver a sellar `creadoEn` con
la fecha de hoy y `creadoPor` con «sembrador» borra que ese apoyo lo creó una persona en julio. En
este sistema una corrección es un **hecho fechado**, nunca una sobrescritura (`CLAUDE.md §3.1`).

**Se lee de la base y aquí sí se puede.** Este script habla con el SDK de administrador, que no pasa
por las reglas. Desde el navegador NO se puede —las reglas **deniegan** leer un documento que aún no
existe, y por eso `ADR-028` resolvió lo suyo por otro camino—. Misma prohibición, dos caminos: no es
contradicción, y queda dicho en el propio código para que nadie lo «arregle».

**La regla vive en el módulo PURO** (`herramientas/construir-apoyos.mjs`), no en el script: el
sembrador aborta nada más cargarse si no hay credencial, así que una regla escrita ahí dentro es una
regla que ninguna prueba puede tocar. Es la misma razón por la que ese módulo existe.

**El sembrador DICE lo que se encontró:** cuántos documentos ya existían, cuáles los ha editado
alguien desde la aplicación (revisión > 0) y cuántos campos de ficha declarados tienen. El sembrador
no trae esos campos y por tanto no los toca — pero que sea verdad hoy no significa que lo sepa quien
corra el script.

### Alternativas descartadas

- **Que el sembrador se salte los apoyos con revisión > 0.** Era la otra opción que `ADR-030` puso
  sobre la mesa, y deja fuera lo que el sembrador sí debe actualizar: la geometría de la bóveda, que
  es su fuente de verdad. Un apoyo editado dejaría de recibir una corrección de coordenada.
- **Escribir `revision` con un incremento (`FieldValue.increment(0)`).** No toca el valor, pero sigue
  siendo el sembrador metiendo mano en el cerrojo de otro; y en un documento nuevo no vale.
- **Quitar `revision` del sembrado también en los documentos nuevos.** Entonces el primer guardado
  desde la aplicación compararía contra un campo ausente. `revision: 0` en el alta es correcto.

### Consecuencias

- **El Ingeniero puede editar fichas sin que la siguiente siembra le rompa el guardado.** Es la
  condición para que `TODO-57` —el cuello de botella real— se pueda trabajar sin sobresaltos.
- **Una pasada del sembrador ya no rejuvenece los documentos:** `creadoEn` sigue diciendo julio.
- **Cuesta una lectura por documento** (`db.getAll`) antes del lote. Son 27 documentos: irrelevante,
  y las lecturas de una siembra manual no mueven la factura (`31 · L-02`).
- **Queda sin correr contra la base real.** La regla está probada en el módulo puro (4 pruebas), y la
  pasada real espera a que la llave de administración vuelva a existir.

### Crudo de respaldo

*(sin comité: la decisión venía acotada a dos opciones por `ADR-030` y se eligió la que no pierde
correcciones de geometría. Evidencia: `tests/sembrar-mapeo.test.js`.)*


## ADR-034 · 2026-08-19 · Dos capas de imagen sobre el mapa: se ENCIENDE la satelital y entra la temperatura del suelo — con datos abiertos y sin pedirle nada a nadie

**Estado:** ✅ Decidido · ⚠️ **NO revisada externamente**

### Contexto

El botón «Satelital» llevaba meses en pantalla, apagado, con el rótulo *«licencia por
verificar»* (`31 · L-03`). El Ingeniero pidió encenderlo y, además, **una capa donde se pueda
apreciar la temperatura en toda la zona de influencia de la línea**.

La verificación de licencias que faltaba se hizo el 19-08, con la fuente y la fecha delante
(`3.2`: los límites de un plan gratuito NO se citan de memoria). El resultado cierra tres puertas:

- **Esri World Imagery** — exige cuenta de ArcGIS y **no permite uso comercial**.
- **EOX Sentinel-2 cloudless** (`s2maps`) — las ediciones de 2018 en adelante son CC BY-**NC**-SA,
  y el uso comercial exige comprar la *EOX Commercial Attribution-RestrictedUse License*.
- **Open-Meteo**, la vía obvia para «temperatura» — su plan gratuito dice, con esas palabras, que
  solo se puede usar con fines **no** comerciales.

Esta es una herramienta de trabajo de un empleador: es uso comercial. Las tres quedan fuera por lo
mismo que ya sacó a MapTiler y a Stadia del proyecto en su día.

### Decisión

**No se contrata a un proveedor de teselas: se PROCESA el dato abierto y se autohospeda**, que es
exactamente lo que ya hace el mapa base (ADR-001). Dos capas nuevas, dos archivos `.pmtiles` que
viajan con el sitio:

- **Satelital — Copernicus Sentinel-2 L2A, color verdadero, 10 m.** La política de datos de
  Copernicus es «*free, full and open*» **sin restricción de uso comercial**; el único deber es la
  atribución. La copia se lee de AWS Open Data, que no pide cuenta ni clave. **3,5 MiB.**
- **Temperatura de la SUPERFICIE — Landsat 9, banda ST_B10, 100 m remuestreados a 30 m.** Producto
  del USGS: **dominio público**. La copia anónima se lee de Microsoft Planetary Computer. **2,2 MiB.**

**EL RECORTE ES EL ÁREA METROPOLITANA ENTERA, y esto no es una preferencia: es el secreto del
corredor.** Un raster ceñido a la línea la DELATA, y este repositorio es público. Se exige por
prueba que las tres capas tengan **exactamente los mismos límites** y que el recorte pase de 20 km
en las dos direcciones.

**LAS DOS CAPAS SE DESCARGAN SOLO CUANDO ÉL LAS PIDE.** El mapa base ya pesa 4,3 MB; sumar otros
6 MB a la carga inicial castigaría con megabytes a quien nunca las va a mirar, y este sistema tiene
que poder abrirse desde el campo.

**EL TÉRMICO NO ES FONDO: VA ENCIMA, y es una casilla aparte.** Se puede leer sobre el callejero o
sobre la satelital, que es como se usa de verdad — «esta mancha caliente, ¿sobre qué está?».

**LO QUE MIDE EL TÉRMICO SE DICE EN LA PROPIA LEYENDA, y es la decisión más importante de esta
ola:** es la temperatura del **SUELO** —tierra, techos, asfalto— vista desde arriba **en un
instante** (el paso del satélite, sobre las 10 de la mañana), **no la del aire y no un promedio**.
Al mediodía el asfalto puede estar 15-20 °C por encima del aire. La leyenda dice, con todas las
letras, que **no alimenta ningún cálculo de la línea**: la ecuación de cambio de estado va con
temperatura del AIRE, y confundirlas metería 15 °C de error en un número que se firma. El riesgo de
esta capa no es que engañe al ojo: es que alguien la cite para justificar una hipótesis.

**La rampa de color tiene cortes FIJOS en grados**, no estirados al máximo y al mínimo de la escena:
una rampa que se reescala sola pinta el mismo color sobre temperaturas distintas en dos fechas, y
entonces comparar dos mapas engaña. Y se pinta en **escalones de 1 °C**, porque el producto trae una
incertidumbre de ese orden: una rampa continua enseñaría décimas que el sensor no tiene.

**Los rótulos del callejero se quedan encendidos sobre la satelital.** Una foto aérea sin un solo
nombre no dice dónde está uno, y el gesto que sigue es apagar la capa.

**Cada capa lleva su ficha `.json` con la fecha de la toma, la nubosidad, la resolución, la fuente y
la licencia** — y la pantalla imprime la fecha al lado del rótulo. Una imagen sin fecha en una
herramienta de mantenimiento se lee como «así está hoy», y así es como alguien concluye que un vano
está despejado mirando una foto de hace dos años.

### Alternativas descartadas

- **Un proveedor de teselas comercial** (Esri, Mapbox, Google, MapTiler). Rompe las tres patas de
  ADR-001 a la vez —cuota, contrato y dependencia de red— y las licencias verificadas lo prohíben o
  lo cobran. Con `--seco` no hay medias tintas: o el dato es abierto, o no entra.
- **Recortar la imagen al corredor** para que pesara cuatro veces menos. Publicaría el trazado.
- **Estirar la rampa térmica a los percentiles de cada escena.** Se ve mejor y miente al comparar.
- **Un mapa de temperatura del AIRE.** No existe a esta escala: el modelo meteorológico más fino que
  cubre el Caribe colombiano tiene celdas de kilómetros, así que sobre 3 km de línea sería **un solo
  color**. Un mapa de un píxel pintado como si fuera un campo es peor que no tenerlo. Si lo que hace
  falta es la temperatura del aire para la hipótesis de cálculo, eso es una SERIE con sus
  percentiles, no una capa — y es trabajo aparte, declarado en `10`.

### Consecuencias

- **El botón «Satelital» deja de estar apagado tras dos meses**, y con la imagen se puede mirar por
  fin la vegetación del corredor, que es media inspección de una línea.
- **+5,7 MiB en el repositorio**, en dos archivos binarios que no cambian salvo que se reconstruyan.
  Ninguno pasa de los 25 MiB que Cloudflare Pages sirve por archivo (verificado con su documentación
  el 19-08), y la prueba lo vigila.
- **Coste $0 y ninguna llamada a terceros en tiempo de ejecución.** Sigue habiendo un solo trabajador
  (el portero de fotos) y nada que facture.
- **Las imágenes son una FOTO FIJA.** Refrescarlas es volver a correr la herramienta a mano; no hay
  ningún proceso que las actualice solo, y por eso la fecha va impresa al lado del rótulo.
- **Entra una herramienta en Python al repositorio** (`herramientas/teselas/construir-raster.py`).
  Es la primera: reproyectar un raster sin GDAL no es razonable. No la necesita ni la aplicación ni
  las pruebas — solo quien reconstruya las capas.
- **La prueba nueva vigila el invariante que de verdad importa**: que en el componente del mapa no
  aparezca ni una URL de teselas de terceros. El fallo sería por texto —alguien pega una URL— y por
  texto se caza.

### Crudo de respaldo

*(sin comité. La parte cara de esta decisión era la verificación de licencias, y eso no se delibera:
se lee en la fuente. Las cuatro fuentes citadas se consultaron el 2026-08-19 y quedan enlazadas en
la cabecera de `herramientas/teselas/construir-raster.py`.)*

**Evidencia reproducible:** `tests/mapa-capas.test.js` (12) · las dos fichas `.json` en
`web/public/mapas/` traen escena, fecha, nubosidad y licencia de cada imagen.

### Verificado en vivo (2026-08-19)

Con el Chrome del Ingeniero, sobre producción y con su sesión: la capa satelital se enciende sobre
la línea, con los rótulos del callejero encima y la atribución de Copernicus al pie.

**Y así se cazó el fallo que las pruebas no podían ver:** la primera versión desplegada dejaba el
mapa **BLANCO** al encender la capa. La capa existía, la fuente existía, `isSourceLoaded()` decía
`true`, la atribución salía… y no se pedía ni una tesela, sin un solo error. Una fuente raster
añadida con el mapa quieto se queda esperando un `requestAnimationFrame` que nadie pide, y ahí muere
(`32 · L-55`). Se arregla con un `triggerRepaint()`. En el mismo viaje salió que el efecto corría
antes de que el estilo estuviera armado y reventaba con un `TypeError` invisible. Las dos líneas
quedan fijadas por prueba, porque ninguna de las dos se ve venir leyendo el código.


## ADR-035 · 2026-08-19 · El pronóstico entra como capa, pero no como dato: se pide, se mira y se olvida

**Estado:** ✅ Decidido · ⚠️ **NO revisada externamente**

### Contexto

El Ingeniero pidió ver también el pronóstico del tiempo sobre el mapa. A diferencia de las dos capas
de `ADR-034`, un pronóstico **no se puede autohospedar**: cambia cada pocas horas, así que un archivo
que viaje con el sitio nace caducado. Hay que preguntárselo a alguien, en el momento.

Eso choca de frente con la frase con la que se construyó el mapa —«no le pide nada a ningún servidor
de terceros»— y obliga a decidirlo a propósito en vez de por inercia.

**Licencias verificadas el 19-08, en la fuente:** `Open-Meteo`, la vía obvia, dice con esas palabras
que su plan gratuito es **solo para uso no comercial** (ya lo dejó fuera `ADR-034`). `api.weather.gov`
de la NOAA es de dominio público pero **solo cubre Estados Unidos**. **MET Norway**
(`api.met.no/weatherapi/locationforecast`) publica bajo **CC BY 4.0** —uso comercial permitido con
atribución—, **global**, **sin cuenta ni clave**, y sus condiciones **admiten explícitamente** el uso
desde JavaScript en sitios de poco tráfico. Es la única de las tres que sirve aquí.

### Decisión

**El pronóstico es la ÚNICA pieza del mapa que necesita internet, y se declara como tal.** Las
teselas —callejero, satelital, térmica— siguen viajando con el sitio: sin señal el mapa sigue
entero y solo falta esta capa. Es la misma doctrina de `31 · L-11`: una capa opcional jamás veta a
una esencial.

**NO SE GUARDA NUNCA.** Es la decisión que más consecuencias tiene. `datos/clima.ts` guarda sondeos
del IDEAM porque son MEDICIONES —hechos fechados, y las reglas los hacen inmutables—; un pronóstico
es un modelo diciendo qué cree. Archivarlo haría que dentro de un año alguien lo leyera como si
alguien hubiera medido algo. Se pide, se mira y se olvida al cerrar la pestaña. Una prueba vigila
que el módulo no toque Firestore, `localStorage` ni `indexedDB`.

**SE CONSULTA CUANDO ÉL ENCIENDE LA CAPA, NUNCA AL PINTAR** — otra vez la regla de `datos/clima.ts`:
una consulta a un tercero es un acto deliberado, no el efecto de que alguien mire una pantalla.

**NO SE PREGUNTA POR LA LÍNEA.** La coordenada se redondea a una rejilla de 0,1° antes de salir,
con la misma doctrina que `nucleo/clima.js · cajaConsulta`: *el registro de consultas de un tercero
no tiene por qué saber dónde está una torre de un cliente*. Y no cuesta precisión: el modelo trae
celdas de kilómetros, así que redondear devuelve la misma celda. La pantalla enseña por qué celda se
preguntó.

**NO ES UN CAMPO DE COLORES, Y ESO NO ES PEREZA.** El modelo tiene celdas de kilómetros: sobre 3 km
de línea el valor es UNO. Pintarlo como un degradado fingiría un detalle que no existe — el mismo
argumento por el que `ADR-034` descartó un mapa de temperatura del aire. Se pinta como lo que es: el
dato del sitio, con una **flecha de viento** sobre el mapa y una tabla de días.

**LO QUE SÍ ES ESPACIAL SE CALCULA: LA COMPONENTE DE LADO.** Lo que carga un apoyo no es el viento,
es su parte perpendicular al conductor. Con el eje de la línea —promediado con el ángulo DOBLADO,
porque una línea es un eje y no una flecha: un vano al norte y otro al sur promediados a pelo dan la
perpendicular exacta— se publica cuánto del viento previsto empuja de lado. Esa es la única cifra de
esta capa que significa algo para una estructura.

**Y LA FRASE QUE IMPIDE LEERLA AL REVÉS:** el pronóstico se compara con el viento de la hipótesis
diciendo, en la misma línea, que **no la valida ni la desmiente**. La hipótesis es un extremo de
diseño; el pronóstico es el tiempo de nueve días. Que esta semana sople poco no dice nada sobre si
el extremo adoptado es correcto — y creerlo sería el error caro de esta capa.

**Los umbrales de aviso** (40 km/h para trabajo en altura, 20 mm de lluvia al día) son **criterio
adoptado sin norma citada**, y la pantalla lo dice con esas palabras.

### Alternativas descartadas

- **Open-Meteo.** Técnicamente la mejor —sin clave, con CORS, JSON limpio— y descartada por licencia:
  su vía gratuita es no comercial. Si algún día se paga su plan, entra sin tocar nada más que la URL.
- **Autohospedar el pronóstico** (bajar la corrida del modelo y empaquetarla como las otras capas).
  Nace caducado: en seis horas es mentira, y una mentira con aspecto de mapa.
- **Un trabajador que consulte y cachee.** Rompe «UN Worker y solo uno», y no hace falta: el servicio
  admite el uso directo desde el navegador y publica su propio `Expires`, que el navegador respeta.
- **Guardar el pronóstico junto al expediente**, para «tener el histórico». Es exactamente lo que
  convierte una predicción en una falsa medición. El histórico del clima ya tiene su camino y su
  nodo: el sondeo del IDEAM, que sí midió.
- **Pintar un degradado de temperatura o de viento sobre el recorte.** Un mapa de un solo píxel.

### Consecuencias

- **Sirve para lo que se usa de verdad:** decidir la semana. Viento de lado sobre la línea, tormenta,
  lluvia y temperatura del aire, por día, con sus avisos.
- **La capa no funciona sin señal**, y lo dice. Las otras tres sí.
- **Se estrena una dependencia de un tercero en el camino del mapa.** No factura, no pide cuenta y no
  guarda nada nuestro; pero es una dependencia, y el día que MET Norway cambie sus condiciones esta
  capa se apaga. Queda escrito aquí para que ese día se sepa dónde mirar.
- **La petición tiene que ser «simple»** (sin cabeceras propias): sus condiciones dicen que no
  admiten preflight de CORS. Una cabecera «correcta» de más rompe la capa, y por eso hay una prueba
  que lo vigila.

### Crudo de respaldo

*(sin comité: la parte cara era la verificación de licencias, y eso no se delibera, se lee en la
fuente. Las tres condiciones se consultaron el 2026-08-19 y quedan enlazadas en la cabecera de
`web/src/datos/pronostico.ts`.)*

**Evidencia reproducible:** `tests/pronostico.test.js` (35), con la forma real de la respuesta del
servicio comprobada contra su API.


## ADR-036 · 2026-08-19 · La temperatura del suelo deja de ser una imagen y pasa a ser la MEDIDA: doce fechas, y los grados de un punto con un clic

**Estado:** ✅ Decidido · ⚠️ **NO revisada externamente**

### Contexto

El Ingeniero pidió dos cosas mirando la capa que entró en `ADR-034`: que al acercarse **no se vea a
cuadros**, y que la temperatura **se guarde de forma que pueda elegir el día** y obtener sus valores.

Lo primero tenía un diagnóstico incómodo: la capa térmica se veía a cuadros **porque lo que se
guardaba eran cuadraditos de color**. Una imagen ya pintada solo sirve para mirarla — no se le puede
preguntar cuántos grados hay en un punto, no se puede cambiar de día sin reconstruirla entera, y al
ampliarla se amplían sus píxeles. Las dos peticiones eran, en realidad, la misma.

### Decisión

**LO QUE VIAJA ES LA REJILLA DE VALORES, NO LA IMAGEN.** Un byte por celda de 30 m —la rejilla en que
el USGS entrega el producto—, y el color lo pone el navegador con la rampa que declara la ficha. De
ahí salen las tres cosas de golpe: elegir el día, leer los grados de un punto con un clic, y que la
imagen se **interpole** al acercarse en vez de romperse en bloques.

**Sale más barato, además:** doce fechas ocupan **3,4 MiB** en total; la única fecha de antes, pintada
en teselas, ocupaba 2,2 MiB.

**LA CODIFICACIÓN VA EN LA FICHA, no en el código:** `°C = (byte − 1) × 0,3 + (−10)`, y **el byte 0 es
SIN DATO**. Reservar ese byte no es un detalle de formato: es lo que impide que «aquí no se midió» se
lea como «aquí hace 0 °C» y pinte de azul intenso media ciudad.

**SE ENMASCARAN LAS NUBES CON EL `qa_pixel` DEL PROPIO PRODUCTO** — nube, nube dilatada, cirros y
sombra de nube. **Sin esto la capa miente justo donde más parece acertar:** bajo una nube el sensor
térmico no mide el suelo, mide el techo de la nube, que está veinte grados más frío. Esos píxeles
saldrían azules en mitad de la ciudad y se leerían como una zona fresca. Ahora salen en blanco.

**UNA FECHA CON MENOS DEL 50 % DEL RECORTE MEDIDO SE DESCARTA**, y el resto publica su **cobertura**
junto al día. Con medio recorte tapado, la mediana que se publica es la de la otra mitad — y esa
mitad no es un trozo cualquiera: es justo la que no tenía nube encima, que suele ser la más caliente.
La leyenda lo dice con esas palabras.

**DOCE FECHAS DEL ÚLTIMO AÑO**, de la más reciente hacia atrás, buscando entre las escenas con menos
del 25 % de nubes. El filtro grueso es la nubosidad de la escena —110 km de lado— y el fino es la
cobertura del recorte, que solo se sabe tras aplicar la máscara.

**EL CLIC DEVUELVE LOS GRADOS DE ESA CELDA**, y la cuenta va en **Web Mercator**, no en grados: la
rejilla se construyó así, y hacerla en latitud/longitud desplazaría el punto cientos de metros a esta
latitud — el clic diría la temperatura del barrio de al lado, con una cifra creíble.

**Y LO QUE NO CAMBIA:** sigue siendo la temperatura de la **SUPERFICIE** en **un instante**, sigue sin
alimentar ningún cálculo de la línea, y la leyenda lo sigue diciendo.

### Sobre la satelital: no se puede arreglar, se puede DECIR

La imagen satelital también se ve borrosa al acercarse, y ahí no hay nada que arreglar: **Sentinel-2
mide a 10 m por píxel**, y a partir de ahí lo único que se puede hacer es ampliar. Se hicieron las
dos cosas honestas: subir la calidad de compresión —estas teselas se miran ampliadas, y ampliar una
compresión agresiva convierte sus artefactos en manchas que parecen terreno— y **escribirlo en la
propia capa**: «10 m por píxel: al acercarse no hay más detalle, solo se amplía». Imagen abierta de
mayor resolución con uso comercial permitido no existe; la de metro por píxel es de pago, y eso es
una decisión del Ingeniero, no una que se tome por inercia.

### Alternativas descartadas

- **Generar teselas hasta z16 remuestreando.** Multiplica por dieciséis el peso para no añadir ni un
  dato. La borrosidad no se arregla inventando píxeles, se arregla diciendo dónde está el límite.
- **Guardar las doce fechas como teselas de color.** 26 MiB en vez de 3,4, y seguiría sin poder
  decir cuántos grados hay en un punto.
- **Interpolar entre fechas** para «tener todos los días». Sería fabricar mediciones que nadie hizo.
  El satélite pasa cuando pasa; los días que no hay, no hay.
- **Rellenar los huecos de nube** con el valor de alrededor. La misma trampa, y peor: quedaría un
  mapa sin agujeros donde nadie sabría cuáles son medidas y cuáles relleno.

### Consecuencias

- **La capa contesta preguntas que antes no podía:** qué día, cuántos grados aquí, cuánto se midió.
- **Doce archivos nuevos de ~290 KiB** en el repositorio, uno por fecha, más su ficha. Se bajan de
  uno en uno, solo el día que se mira.
- **La ficha de la capa es ahora un contrato de datos**: recorte, tamaño, codificación, rampa y
  fechas. Una prueba comprueba que cada PNG mide exactamente lo que la ficha declara — un archivo que
  no cuadre desplazaría TODAS las lecturas de grados y nadie lo notaría, porque los colores seguirían
  saliendo bonitos.
- **Se retira `cartagena-termico.pmtiles`.** Ya no lo usa nadie.

### Crudo de respaldo

*(sin comité: la decisión la disparó una observación suya —«se pixela»— y el diagnóstico salió de
mirar qué se estaba guardando. Evidencia: `tests/termico.test.js` (18) y `tests/mapa-capas.test.js`.)*

### Verificado en vivo (2026-08-19)

Con el Chrome del Ingeniero, sobre producción: se elige el día entre las doce fechas, la capa se
pinta suave —interpolada, sin cuadros— y el clic devuelve los grados (42,8 °C en un punto del
corredor el 9 de mayo; «ahí no se midió» en un punto que el 13 de agosto estaba bajo nube). Cambiar
de día es instantáneo.

**Y del mismo viaje salieron dos endurecimientos del ciclo de vida del mapa** —los dos correctos por
su cuenta, aunque ninguno era la causa del síntoma que los disparó (ver la corrección en `32 · L-58`:
la pestaña estaba de fondo y Chrome congela ahí el reloj del mapa):

1. **El mapa vivía en una referencia**, y una referencia no despierta efectos: si el efecto de una
   capa caía en el instante en que la referencia era `null` o apuntaba a un mapa ya retirado, salía
   por su guarda y no volvía. El mapa pasa al ESTADO.
2. **`isStyleLoaded()` no era la puerta.** No contesta «¿está el estilo listo?» sino «¿está TODO
   cargado?»: es `false` mientras a cualquier fuente le falte una tesela. Esto sí dio un error real
   —«Style is not done loading»—, y la puerta buena es el evento `load` del mapa. Una prueba prohíbe
   que `isStyleLoaded()` vuelva a usarse como puerta.

Y una tercera de cortesía: entregar la rejilla como PNG codificado tardaba segundos sin decir nada.
Ahora MapLibre lee el lienzo directamente y el aviso de «midiendo…» sale junto al interruptor.


## ADR-037 · 2026-08-19 · La capa del suelo se cambia por el RECURSO SOLAR, que sí es una entrada del cálculo

**Estado:** ✅ Decidido · ⚠️ **NO revisada externamente**

### Contexto

El Ingeniero pidió reemplazar la capa de temperatura del suelo (`ADR-036`) por un índice de radiación
solar. No es un cambio de gusto: la temperatura del suelo era información de contexto que **no entra
en ningún cálculo** de este sistema, y la radiación solar **sí entra** — `nucleo/termica.js` la usa
para la ampacidad (IEEE 738), y hoy lo hace con **1.000 W/m² ADOPTADOS**, el valor clásico de
mediodía despejado, **sin una sola fuente local detrás** (`vistas/termicaDatos.ts`, escenarios
adoptados).

### Decisión

**Entra el recurso solar del corredor, mes a mes**, con la misma mecánica que ya funcionaba: rejilla
de VALORES —no imagen— y el color puesto por el navegador. Trece capas: los doce meses y la media
del año. **Pesa 3 KiB en total.**

**Fuente: Global Solar Atlas 2.0** (Solargis para el Banco Mundial, fondos de ESMAP), datos bajo
**CC BY 4.0** —uso comercial permitido con atribución— y con un punto de consulta público que no pide
cuenta ni clave. Se muestrea **una vez, aquí**, y se autohospeda: la aplicación no le pide nada a
nadie.

**⚠️ LA FRASE QUE SOSTIENE LA CAPA ENTERA, y va en la leyenda:** lo que se mapea es **ENERGÍA DIARIA**
(kWh/m² al día) y lo que come IEEE 738 es una **IRRADIANCIA INSTANTÁNEA** (W/m² al mediodía). **No se
convierte una en otra con una regla de tres.** Dividir la energía del día entre las horas de sol da
un número creíble y falso. Sin esa frase, poner una cifra de sol al lado de una línea invita
exactamente a la conversión que no se puede hacer — y ésta sí acabaría en un cálculo firmado, que es
justo lo que la capa del suelo NO podía hacer. Una prueba la vigila como se vigila una defensa.

**Se muestrea GRUESO y se dice:** una celda cada 2 km sobre un dato de 1 km. El recurso solar varía
suave —de punta a punta del recorte cambia un 7,7 %— así que 2 km dibujan el mismo gradiente con la
sexta parte de peticiones a un servicio ajeno. La leyenda declara que lo que se ve es una muestra.

**Se publica la OSCILACIÓN del año**, no solo la media: entre marzo (6,2) y noviembre (4,6 kWh/m² al
día) hay un **35 %**. Una media anual sola se lleva por delante esa variación, y es justo la cifra
que se suele citar.

**Las mecánicas de la rejilla se separan del dominio.** `vistas/rejilla.ts` queda agnóstico —no sabe
si mide grados o kilovatios hora: la codificación, la rampa y el recorte los declara la ficha— y
`vistas/radiacion.ts` pone lo que es de esta capa. Una capa nueva ya no obliga a tocar la mecánica.

### Alternativas descartadas

- **Dejar las dos capas.** Él pidió reemplazar, y el panel del mapa ya tiene cuatro interruptores:
  una capa más que nadie enciende es ruido con coste de mantenimiento.
- **Mapear la irradiancia instantánea (W/m²), que es la que usa el cálculo.** No existe abierta como
  mapa a esta escala: lo que hay son series horarias de punto (NASA POWER, ~50 km) con meses de
  retraso. Si se quiere cerrar la hipótesis de los 1.000 W/m² con una fuente local, eso es una SERIE,
  no una capa — y queda anotado como decisión suya en `10`.
- **Sampling fino (1 km, 1.400 puntos).** Seis veces más peticiones a un servicio de otro para
  dibujar el mismo gradiente.
- **Descargar el GeoTIFF mundial (268 MB)** y recortarlo. Sería lo más limpio, pero sus URLs de
  descarga publicadas responden 404 hoy; el punto de consulta sí funciona y basta.

### Consecuencias

- **La capa del suelo se retira**: sus doce rejillas, su ficha y su código salen del repositorio.
  `ADR-036` no se borra —la decisión de guardar la MEDIDA en vez de una imagen es lo que hace posible
  ésta— pero su capa ya no está.
- **El mapa pesa 9,6 MB de recortes** (antes 13): las trece capas de radiación ocupan 3 KiB frente a
  los 3,4 MB de las doce fechas térmicas.
- **La aplicación sigue sin pedirle teselas a nadie**, y la única pieza que necesita internet sigue
  siendo el pronóstico (`ADR-035`).
- **Queda una pregunta abierta y es suya**: si el recurso solar del sitio debe cambiar los 1.000 W/m²
  adoptados. La capa informa; la hipótesis se cambia con una fuente y una firma, no con un mapa.

### Crudo de respaldo

*(sin comité: la parte cara era verificar la licencia y comprobar que el gradiente existe —se
midieron cinco puntos del recorte antes de decidir que un mapa era defendible—. Evidencia:
`tests/radiacion.test.js` (10) y `tests/rejilla.test.js` (15).)*

### Verificado en vivo (2026-08-19)

Con el Chrome del Ingeniero, sobre producción: se elige el mes, el mapa se pinta y el clic devuelve
el recurso del punto (6,24 kWh/m² al día en el corredor, en marzo). La leyenda enseña la oscilación
del año —38 % entre febrero y noviembre— y la advertencia de la ampacidad.

⚠️ **Y con ello se cerró un diagnóstico que estaba mal escrito.** El síntoma «se pulsa el interruptor
y no pasa nada» que persiguió `ADR-036` era, en realidad, que la pestaña estaba **de fondo**: Chrome
congela ahí el reloj de animación y el mapa no llega a disparar su `load`. Estaba documentado desde
agosto (`32 · L-16`) y se miró tarde. La lección `L-58` se reescribió para que enseñe eso y no las
dos hipótesis intermedias.

---

## ADR-038 · 2026-08-20 · El lote deja de ser una ausencia declarada: la escritura llevaba meses lista y no había por dónde pedirla

**Estado:** ✅ Decidido · ⚠️ **NO revisada externamente** · ✅ **verificado en vivo contra producción**

### Contexto

`ADR-030` dejó escrito, en pantalla y en su propio texto, que **el lote no entraba en esa ola**: la
escritura `guardarFichaApoyoEnLote` ya existía con sus cuatro salvaguardas —solo los tres campos del
MODELO, solo estructuras, solo rellena huecos, administrador y atómica— y lo que faltaba era su
pantalla. La ficha **declaraba la ausencia en vez de fingirla**, con la frase permanente de por qué
la altura libre, la del amarre y las fases amarradas **no van por lote nunca**.

Mientras tanto el cuello de botella no se movía: **0 de 25 apoyos con veredicto** (`TODO-57`). Los 25
apoyos de LN-627 comparten modelo, así que la carga de rotura, la capacidad longitudinal y el tipo de
apoyo salen de **UN catálogo que es el mismo papel para todos**. A mano son 25 formularios; por lote
es uno.

### Decisión

**Entra la pantalla, y no decide nada.** `vistas/fichaLote.ts` es un módulo PURO que **espeja** la
regla de la escritura para poder decir ANTES de mandar nada quién puede recibir el dato y quién no.
La salvaguarda de verdad sigue viviendo en `datos/firestore.ts`, y una prueba lee su fuente para
comprobar que el espejo no se desincronizó: una guarda que solo vive en el formulario dura hasta el
siguiente formulario.

**Primero QUÉ, después A QUIÉN.** La lista de apoyos no se puede pintar antes de saber qué campos
viajan, y ésa es la regla fina de toda la ola: **el hueco se mide contra los campos que VIAJAN, no
contra los tres siempre**. Quien ya declara el tipo de apoyo sí puede recibir una carga de rotura;
medirlo mal dejaría fuera a medio parque sin un motivo defendible.

**Los que quedan fuera se ENSEÑAN, con su motivo,** y no se esconden. Una lista que solo muestra a
los elegibles esconde justo lo que hace falta para confiar en ella: quien no ve un punto supone que
se perdió. Los tres empalmes de la línea salen apagados con «no es una estructura: un empalme no
sostiene el conductor y no tiene veredicto que desbloquear».

**El antes/después es el MISMO de la ficha** (`loQueVaACambiar`, que ya aceptaba N parches), sobre el
tramo entero y con los que PIERDEN veredicto contados aparte. Un lote mueve muchos apoyos a la vez:
es cuando más falta hace mirarlo antes de escribir.

### Alternativas descartadas

- **Reutilizar el formulario de la ficha con un selector de apoyos encima.** Se descartó porque el
  campo de la ficha enseña «hoy dice: …» de UN apoyo, y en un lote no hay un apoyo: hay muchos. Habría
  que mentir o callar, y las dos son peores que un formulario propio de tres campos.
- **Ofrecer los seis campos y filtrar al guardar.** Es la puerta trasera que el contrato prohíbe por
  escrito. Ofrecer la altura libre en una pantalla de lote la convierte en la herramienta que llena la
  base de datos que PARECEN medidos, aunque la escritura los rechace después.
- **Medir el hueco contra los tres campos siempre.** Más simple de programar y falso: dejaría fuera a
  cualquier apoyo que ya declare uno solo de los tres.

### Consecuencias

- **El trabajo de catálogo pasa de 25 formularios a uno.** Es la pieza que más tiempo ahorra de toda
  la ola de la ficha.
- ⚠️ **Y no desbloquea ni un veredicto por sí sola, lo cual se comprobó en producción antes de
  escribir nada:** con la carga de rotura aplicada a los 25, el panel responde *«Ningún apoyo gana
  veredicto con esto. De 25 apoyos del tramo, 25 siguen sin veredicto»*, porque a todos les faltan
  además **la altura libre y la del amarre**, que no van por lote. El lote llena **uno de los tres**
  campos que faltan — el más fácil de conseguir, el que está en un papel— y los otros dos siguen
  exigiendo campo. → lección **`L-59`**; refuerza `TODO-57` y `TODO-59`.
- **La pantalla no ofrece nunca lo que la base va a negar:** aplicar a varios exige **administración**,
  no edición, y cuando la sesión no lo tiene se explica en vez de esconder el botón.
- **Nada se escribió en la base durante la verificación**, a propósito: el botón lo pulsa el Ingeniero
  cuando tenga el catálogo real delante.
- `TODO-70` ② queda cerrado. De la ola de la ficha solo sobrevive ③, el gesto «Confirmo este dato»,
  que sigue exigiendo su propio molde porque `FichaEstructural` rechaza `confirmado_humano` por diseño.

### Verificado en vivo (2026-08-20)

Con el Chrome del Ingeniero, sobre **producción** y con su sesión de administración: el panel abre,
reconoce el permiso, ofrece los tres campos del modelo y ninguno de ejemplar; con la carga de rotura
declarada aparecen los 25 apoyos marcables y los **3 empalmes bloqueados con su motivo**; «Marcar los
25 que pueden recibirlo» enciende el botón —«Escribir el dato en 25 apoyos»— y el panel del motor
responde que ninguno ganaría veredicto y **por qué le falta a cada uno**. Cero errores en consola.
Bundle servido `index-BtQo103o.js` == el construido. **No se pulsó el botón: no se escribió nada.**

### Crudo de respaldo

*(sin comité: la decisión estaba tomada y escrita en `ADR-030` —qué va por lote, qué no y por qué—;
esta ola solo construyó la pantalla que faltaba. La evidencia reproducible son las 27 pruebas de
`tests/ficha-lote.test.js`, con mundo sintético.)*

---

## ADR-039 · 2026-08-20 · La temperatura del AIRE entra al mapa: la del suelo no alimentaba ningún cálculo, ésta sí

**Estado:** ✅ Decidido · ⚠️ **NO revisada externamente** · ✅ **verificado en vivo contra producción**

### Contexto

El Ingeniero pidió «una capa de temperatura ambiente conforme a la posición geográfica a lo largo de
la línea y todo el mapa». No es la capa que `ADR-037` retiró: aquélla era la temperatura de la
SUPERFICIE (Landsat ST_B10) —tejados y asfalto vistos desde arriba— y se quitó justamente porque **no
entra en ninguna ecuación de este sistema**. La del AIRE entra por dos puertas: es entrada directa de
la ampacidad (IEEE 738) y es el marco de las cuatro temperaturas de la hipótesis, hoy ADOPTADAS sin
fuente local (`TODO-71`).

### Decisión

**La misma fuente que ya sirve el recurso solar**, sin estrenar dependencias ni licencias: Global
Solar Atlas 2.0, capa `TEMP` —temperatura del aire a 2 m, °C, promedio de largo plazo **1994-2025**,
versión 2.2.67, lo declara el propio servicio— bajo **CC BY 4.0**, sin cuenta ni clave. 352 puntos
muestreados una vez, 0 fallos, **3 KiB** las trece rejillas (doce meses y la media del año).

**Dos frases que impiden el mal uso, y las dos van en pantalla:**

1. **Es una MEDIA, no un extremo.** El tiro máximo en frío se juega con la MÍNIMA histórica y la
   ambiente de diseño de la ampacidad con un percentil ALTO; una media no es ni lo uno ni lo otro.
   Leer los 27 °C como «la mínima del sitio» dejaría el tiro corto y un terminal parecería sano.
2. **El mapa se ve casi de un color, y NO está roto.** La media anual cambia **1,2 °C** de punta a
   punta del recorte (medido, y viaja en la ficha), mientras que entre meses hay **1,3 °C**. La rampa
   es FIJA y ancha (5-35 °C) a propósito: estirarla a la variación del recorte dibujaría un degradado
   espectacular que sería ruido amplificado.

**La media del sitio se pone AL LADO de la hipótesis, sin dictaminar.** Comparar no es validar, igual
que en el pronóstico (`ADR-035`).

### Alternativas descartadas

- **Estirar la rampa al recorte** para que «se vea algo»: fabrica un gradiente que no existe.
- **Dos capas de medida encendidas a la vez**: dos rampas de color sobre el mismo territorio no se
  leen —la de arriba tapa a la de abajo— y el clic no sabría a cuál contesta. Son EXCLUYENTES.
- **Duplicar el efecto del mapa para la capa nueva**: habría dejado 120 líneas repetidas en un archivo
  de 1.100. Lo común subió a `rejilla.ts`, que `ADR-036` dejó agnóstico justo para esto.

### Consecuencias

- **La ampacidad tiene por primera vez una cifra local al lado.** Y aparece un dato que el Ingeniero
  no tenía: la EDS adoptada del cálculo es **28 °C** y la media del sitio **27,3 °C** — la suposición
  se sostiene, con 0,7 °C de margen. Es exactamente el tipo de comprobación que `TODO-71` pedía, y no
  lo cierra: cerrarlo exige una SERIE con percentiles, no una media.
- **La marca de lo pintado lleva ahora QUÉ medida además del mes.** Sin eso, cambiar de capa en el
  mismo mes se saltaba el repintado y dejaba la capa anterior bajo la leyenda nueva.
- `vistas/rejilla.ts` gana la mecánica temporal; `radiacion.ts` delega y **no renombra nada**.

### Verificado en vivo (2026-08-20)

Con el Chrome del Ingeniero, sobre producción: la capa enciende, el clic devuelve **27,6 °C** (media
del año) y **28,0 °C** en marzo sobre el mismo punto —la rejilla se recarga—, la leyenda enseña la
amplitud medida y la comparación con la hipótesis, y encender «Radiación solar» apaga la temperatura
y cambia la leyenda. Cero errores en consola.

### Crudo de respaldo

*(sin comité: la fuente y su licencia ya se habían verificado en `ADR-037`; lo nuevo es la capa `TEMP`
del mismo servicio, comprobada leyendo su metadato. Evidencia reproducible: `tests/temperatura.test.js`.)*

---

## ADR-040 · 2026-08-20 · La satelital se remuestrea en origen, y se dicen los DOS números; a más resolución no se puede ir por LICENCIA, no por técnica

**Estado:** ✅ Decidido · ⚠️ **NO revisada externamente** · ✅ **verificado en vivo contra producción**

### Contexto

El Ingeniero: *«la vista satelital carece de resolución gráfica, corrige y mejóralo»*. Tenía razón en
el síntoma: el mapa dejaba de tener imagen propia en el nivel 14 (9,4 m/píxel) y de ahí en adelante
era el NAVEGADOR quien estiraba la última tesela, con el filtro que le tocara y en cada fotograma.

### Decisión

**Dos mejoras reales de presentación, y ni una de detalle inventado:**

- **Remuestreo en origen hasta el nivel 15** (4,7 m/píxel). Lo hace el generador una vez, con buen
  filtro, en vez de dejárselo al navegador. Pesa **12,6 MiB** (de 5,2), holgado bajo el tope de
  25 MiB por archivo de Cloudflare Pages.
- **Realce mejorado**: percentiles 1-99 (antes 2-98), **gamma 0,88** —media escena tropical vive en la
  parte baja del histograma— y **máscara borrosa** suave, que devuelve el borde que la interpolación
  acaba de comer. Todo declarado en la ficha como cosmético.

**Y la pantalla dice los DOS números**: lo que MIDE (10 m) y a lo que se PUBLICA (4,7 m), en ese
orden. Decir solo el segundo sería vender un detalle que no existe.

### Alternativas descartadas — y ésta es la parte que importa

**Se buscó una fuente de más resolución y SE ENCONTRÓ, pero no se puede usar:**

- **Ortoimágenes del IGAC.** Existen, responden y cubren este recorte: **3 m para todo Bolívar** y
  hasta **10 cm en Turbaco** (se comprobó descargando muestras del `ImageServer`). ❌ **Licencia**:
  Colombia en Mapas declara que la imagen tiene *«licencia de uso gubernamental, razón por la cual, no
  puede ser compartida ni comercializada con empresas privadas o personas naturales»*. Este sistema
  AUTOHOSPEDA sus capas en un sitio público: republicarla **es** compartirla. Descartada.
  ⚠️ Y ojo con el matiz que casi cuesta caro: el IGAC publica sus datos **catastrales** bajo CC BY-SA
  4.0, y esa página es la que sale primero. **La licencia de los datos no es la de las imágenes.**
- **Planet NICFI** (<5 m, trópicos): licencia no comercial y **sin redistribución** de la imagen.
- Esri, Google, Bing, Mapbox: ya descartadas en `ADR-034` por uso comercial prohibido o de pago.

**Conclusión, verificada y no supuesta: 10 m es el techo de la imagen abierta que este proyecto puede
publicar.** La pantalla lo dice con esas palabras.

### Consecuencias

- Al acercarse se ve **notablemente** mejor —naves, tanques y viales de la zona industrial se
  distinguen—, y sigue sin haber detalle nuevo. Las dos cosas son ciertas y las dos están escritas.
- **El camino a 3 m o 10 cm existe y está probado**: si el Ingeniero consigue autorización del IGAC
  —o AFINIA la tiene por convenio—, el generador ya sabe pedir esas imágenes. Es una gestión suya, no
  un problema técnico. → `TODO-72`.
- Lección de método → **`L-60`**.

### Crudo de respaldo

*(sin comité. Evidencia: las fichas de los servicios del IGAC y las muestras descargadas, la cita
literal de Colombia en Mapas y la comparación visual antes/después. Guardián: `tests/mapa-capas.test.js`.)*

---

## ADR-041 · 2026-08-20 · Corrección de criterio: un mapa que no enseña su gradiente no informa, y el zoom tiene que llegar donde llega el ojo

**Estado:** ✅ Decidido · ⚠️ **NO revisada externamente** · ✅ **verificado en vivo contra producción**

### Contexto

El Ingeniero, sobre lo entregado unas horas antes: *«necesito que en la capa de temperatura se vean
los gradientes, en la vista satelital mira que sigue pixelado cuando hago zoom»*. Las dos
observaciones apuntan al mismo error mío: **prudencia mal calibrada**, dos veces.

### Decisión

**1 · La rampa de temperatura se ajusta al dato (`ADR-039` corregido).** Era FIJA y ancha (5-35 °C)
para que dos recortes se pudieran comparar sin recalibrar, y sobre un corredor costero eso dejaba el
mapa de un solo color: los 3,1 °C que separan el punto más fresco del más cálido caían dentro de un
mismo tramo. **Se veía honesto y era inútil.**

El argumento con el que defendí la escala fija —«estirarla amplifica el ruido»— **confundía dos
errores distintos**: el ABSOLUTO del modelo (±1 °C, que corre igual para todas las celdas y por tanto
NO inventa gradientes) y el RELATIVO entre celdas vecinas del mismo reanálisis, que es mucho menor.
El gradiente costa-interior que se ve es señal del modelo, no ruido aleatorio. La prudencia estaba
puesta en el sitio equivocado: protegía de un riesgo que no existía y costaba la información entera.

⚠️ **La rampa se calcula sobre las TRECE capas a la vez, nunca por mes.** Una escala por mes
repintaría el mismo color sobre temperaturas distintas y comparar dos meses engañaría — ese sí era un
riesgo real, y se conserva.

**Y el aviso cambia de bando.** Antes explicaba por qué el mapa se veía liso; ahora dice que **el rojo
NO es calor extremo, son 3,2 °C más que el azul**, con los extremos escritos. Un mapa que afirma con
color y no publica su escala es más peligroso que uno que no afirma nada.

**2 · La satelital sube al nivel 16** (2,4 m/píxel; era 9,4 esta mañana y 4,7 hace un rato). Se lee a
4,7 m y se amplía una vez con Lanczos en vez de pedirle a GDAL cuatro veces más píxeles —el dato es de
10 m, así que por debajo todo es interpolación venga de donde venga— y la nitidez se aplica DESPUÉS de
ampliar. Calidad WEBP 82 en vez de 90: **se cede compresión antes que zoom**, porque la compresión en
una imagen ya interpolada casi no se ve y el zoom es lo que él está mirando. **18,9 MiB**, dentro del
tope de 25.

### Alternativas descartadas

- **Escala de temperatura por mes**: haría incomparables los meses entre sí.
- **Subir la satelital al nivel 17**: no cabe en 25 MiB por archivo ni cediendo calidad, y a 1,2 m
  desde un dato de 10 m la interpolación ya no aporta nada que el ojo distinga.
- **Volver a muestrear los 352 puntos para cambiar la rampa**: no toca un solo valor —las rejillas
  guardan el byte, no el color—. El generador gana `--reusar`, que rehace la ficha desde el disco.

### Consecuencias

- **El mapa de temperatura ahora informa**: se ve la brisa marina (bahía más fresca) y el mes cambia
  el tono de todo el recorte.
- **La satelital deja de verse en bloques al acercarse.** A 200 m de escala se distinguen naves,
  tanques y viales. Más allá seguirá difuminándose: el dato es de 10 m y eso es físico.
- **Lección de método → `L-61`**: la prudencia que borra la señal no es prudencia.

### Verificado en vivo (2026-08-20)

Con el Chrome del Ingeniero, sobre producción: la leyenda enseña la escala 25,2-28,4 °C y el aviso
nuevo; el mapa muestra el gradiente; la satelital carga y se recorre hasta 200 m de escala sin
bloques. Cero errores en consola.

### Crudo de respaldo

*(sin comité: corrección directa sobre observación del dueño, con la evidencia a la vista. Guardianes:
`tests/temperatura.test.js` y `tests/mapa-capas.test.js`.)*

---

## ADR-042 · 2026-08-20 · El mapa como pantalla: pestaña «Detalle GPS», y lo que una revisión adversarial encontró dentro

**Estado:** ✅ Decidido · ✅ **revisada por Fable 5** (a pedido del Ingeniero) · ✅ **verificado en vivo**

### Contexto

*«necesito que organicemos la parte donde se ven los apoyos en el mapa, el fondo está en la mitad […]
quizás podemos crear debajo de resumen un apartado que se llame detalle GPS de la línea y ahí se pueda
apreciar mejor y más grande el mapa con los filtros de fondo a un lado […] verifica con fable»* — el
Ingeniero, 2026-08-20.

El panel de capas flotaba SOBRE el mapa. Funcionaba mientras fue un selector de dos líneas; al ganar
la leyenda de la capa encendida —mes, barra de color, avisos— creció hasta tapar el trazado. Y el
«no veo los gradientes» tenía una causa que no era la rampa (`ADR-041`): el mapa arranca encuadrado en
la LÍNEA, y a esa escala el aire no cambia. El gradiente vive a escala del RECORTE.

### Decisión

**Pestaña `Detalle GPS`, pegada a Resumen.** Mapa a ancho completo y más alto, controles AL LADO con
su propio desplazamiento, y debajo las coordenadas levantadas punto por punto. **No es un mapa nuevo**:
es el mismo componente con una prop de disposición (`panelALado`) — un segundo mapa habría sido un
segundo sitio donde arreglar cada fallo.

**Botón «Ver todo el recorte»** en la leyenda de temperatura, con la frase que explica por qué hace
falta. Sin una forma de llegar al recorte de un clic, lo que uno concluye es que la capa está rota.

### Lo que encontró la revisión (Fable 5) — y estaba en lo cierto

1. **Las tres redes del mapa se habían perdido.** `datos/cargar.ts` se declara «la ÚNICA frontera de
   carga diferida» porque una que falla MATA la aplicación —ya pasó—. La pestaña creó una segunda sin
   reintentos, sin error boundary y sin `respaldo`: un fallo de descarga se llevaba la aplicación
   entera, o dejaba una caja vacía con el panel encima, que parece sano y no hace nada. Y a esta
   pestaña se llega por enlace directo desde el teléfono, en campo.
2. **La pestaña «en grande» era MÁS PEQUEÑA que el mapa del Resumen** en cualquier portátil: se usó
   `@media` de ventana para apilar el panel, y el caparazón de tres columnas se come ~460 px, así que
   la regla no se dispara nunca. El propio `estilo.css` lo tenía escrito 900 líneas antes para otra
   rejilla. → `@container contenido`.
3. **La leyenda daba una cifra falsa**: imprimía la amplitud de la MEDIA ANUAL con la frase «en un mes
   dado». Los meses van de 0,84 a 1,68 °C: falsa para once de los doce.

Y dos de coherencia: la cabecera de `vistas/temperatura.ts` seguía defendiendo la rampa fija que
`ADR-041` revocó horas antes —una mina para la próxima sesión—, y la pantalla agregaba por su cuenta
sistema, método y peor precisión tomando los dos primeros de la PRIMERA FILA, cuando el exporte ya los
agrega distintos precisamente porque pueden mezclarse. Ese hecho tiene ahora dueño para pantalla:
`vistas/planta.ts · resumenDelLevantamiento`.

### Consecuencias

- **15 pruebas nuevas fijan los tres fallos**, que es lo que impide que vuelvan. Suite: 1.622.
- **La revisión adversarial con otro modelo se paga sola.** Los tres hallazgos eran invisibles desde
  dentro: los dos primeros solo se ven leyendo doctrina que yo mismo había escrito, y el tercero
  exigía contrastar la frase con la ficha real. → lección `L-62`.
- `PlantaSvg` y `RespaldoMapa` pasan a exportarse desde `Linea.tsx`: las usan DOS pantallas y copiarlas
  habría creado la segunda red que se desincroniza.

### Verificado en vivo (2026-08-20)

Con el Chrome del Ingeniero, sobre producción y con su sesión: la pestaña aparece bajo Resumen, el
mapa ocupa el ancho con los controles fuera, los 25 apoyos y los siete tramos se ven de una vez, el
botón encuadra el recorte y **el gradiente de temperatura se aprecia** (costa cálida, interior más
fresco). La tabla de coordenadas lista los 28 puntos. Cero errores en consola.

### Crudo de respaldo

*(la deliberación fue la propia revisión adversarial; su reporte está resumido arriba punto por punto
y convertido en `tests/detalle-gps.test.js`, que es la forma ejecutable del crudo.)*

---

## ADR-043 · 2026-08-21 · La satelital SÍ se pintaba: lo roto era la SONDA. Instrumento por instancia y banco de pruebas sin sesión

**Estado:** ✅ Decidido · ⚠️ **NO revisada externamente** · ✅ **verificado en vivo contra producción**

### Contexto

`ADR-041/042` dejaron la capa satelital ABIERTA: dos arreglos hechos el 20-08 y el veredicto era que
**seguía sin pintarse**. Ese veredicto se apoyaba en una sola medida: `window.__mapaLineas` contestaba
`loaded() === false` y un estilo vacío.

**Esa medida no podía ser cierta ni falsa: era ILEGIBLE.** `window.__mapaLineas` es UNA variable y el
componente `Mapa` se monta en DOS pantallas (Resumen y Detalle GPS). La pisaba la última en montarse,
nadie la borraba al desmontar, y entre «voy a crear un mapa» y «aquí está» hay un `await` de varios
megabytes. Podía estar contestando por una instancia ya retirada.

### Método — se arregló el INSTRUMENTO antes de volver a diagnosticar

1. **Sonda por instancia** (`componentes/sondaMapa.ts`): una entrada por mapa, con su PANTALLA
   declarada en el sitio de montaje, baja explícita al desmontar, diario de sucesos, contador de
   teselas por fuente y el estado tesela a tesela.
2. **Banco de pruebas sin sesión** (`web/sonda-satelital.html`): monta el componente REAL con apoyos
   sintéticos derivados del recorte público. Hasta ahora, cada medida sobre el mapa dependía de que
   alguien abriera su navegador y entrara.
3. **Se comprobó qué hay DESPLEGADO, no qué se commiteó**: el fuente extraído del *sourcemap* que
   sirve Cloudflare es idéntico byte a byte a `6ca238f`, y el `.pmtiles` de producción tiene el mismo
   SHA-256 que el del repositorio. Los dos arreglos ESTABAN en producción.
4. **Verificación en vivo** con el Chrome del Ingeniero, sobre producción y con su sesión: la foto
   pinta en **las dos pantallas**, con los nombres encima (vista híbrida) y la fecha de la toma.
   Números de la sonda: capa visible en el orden 57, primer rótulo en el 58, **12 teselas cargadas y
   las 12 en la tarjeta gráfica, 0 errores**. Con la temperatura encendida, el apilado correcto:
   callejero · foto · medida · rótulos · trazado.
5. **Prueba causal, no coincidencia** (`TODO-66` aplicado a mí mismo): se quitó `style.load` del
   código actual y **el fallo volvió exacto** — sin «estilo montado» en el diario, el vigilante de
   15 s disparando y la capa sin añadirse. Se restauró y volvió a pintar. El arreglo de `ed95baa` es
   la cura, demostrada por retirada y reposición.

### Decisión

- **Ninguna sonda del mapa vuelve a ser global.** Alta con pantalla, baja ANTES del `remove()`. Se
  retira además el segundo global (`window.__mapa`) que vivía en `crearMapa`: dos sondas globales para
  lo mismo no es redundancia, son dos sitios donde equivocarse.
- **`window.__mapaLineas` sobrevive como *getter*** que devuelve la única instancia viva; con cero o
  con varias **lo dice** en vez de entregar un objeto cualquiera.
- **El banco de pruebas no se publica**: Vite solo lo construye con `SONDA_MAPA=1`, y hay guardián.

### Alternativas descartadas

- **Seguir depurando el componente.** Era la vía por la que ya se habían ido dos sesiones. No había
  nada que arreglar ahí: el camino de la imagen estaba sano, y demostrarlo costó veinte minutos con el
  banco.
- **Dejar la sonda global «pero con cuidado».** Una sonda que puede mentir no se arregla con
  disciplina: se arregla o se quita.
- **Declararlo cerrado con el arreglo ya desplegado y ya.** Sin la prueba de quitar `style.load` no se
  sabría si el fallo se curó o se escondió.

### Consecuencias

- **La capa satelital queda CERRADA**, con la foto vista en producción y el porqué demostrado.
- **Una inferencia de `6ca238f` era falsa y queda anotada:** «un mapa sin estilo es un mapa al que ya
  se le llamó `remove()`». Medido hoy: un mapa que está pintando perfectamente contesta
  `loaded() === false`. Ese síntoma **no prueba** que el mapa esté muerto. El arreglo que salió de esa
  inferencia —cerrar la carrera de las dos instancias— sigue siendo correcto por su cuenta.
- **Se puede depurar el mapa sin el Ingeniero delante**, que era el cuello de botella real de las dos
  sesiones anteriores.
- Lección → **`32 · L-63`**.

### Crudo de respaldo

*(sin comité. La evidencia es reproducible y ejecutable: `tests/sonda-mapa.test.js`, el banco
`web/sonda-satelital.html`, y el experimento de retirada de `style.load` descrito arriba.)*

---

## ADR-044 · 2026-08-21 · El cable de guarda entra al sistema como INVENTARIO de daño, vano a vano, y se pinta sobre el mapa

**Estado:** ✅ Decidido · ⚠️ **NO revisada externamente** · ✅ **verificado en vivo contra producción**

### Contexto

El Ingeniero aporta que LN-627 tiene tramos **sin cable de guarda** —E06–E09 y E21–E22— y, preguntado,
precisa lo que cambia el encuadre entero: **no es diseño, es daño acumulado por fallas a lo largo de la
operación.** Medido contra producción son **903 m de 3.024 (29,9 %)**, y no son vanos cualesquiera:
**tres de los cuatro vanos más largos de la línea** son justo los que no llevan guarda.

El sistema no tenía dónde ponerlo. El concepto solo existía como **supuesto declarado FUERA** (la carga
transversal cuenta `3·circuitos` con el guarda excluido) y como campo opcional de la memoria de
cantidades. Y `Hallazgo` —que parecía el molde— **existe en el contrato y en las reglas pero no lo usa
nadie**: además cuelga de UN apoyo, y esto es un tramo ENTRE dos.

### Decisión

**El dato va en el APOYO DE AGUAS ARRIBA y describe SU VANO SALIENTE.** Contrato **0.7.0**, aditivo:
`cableGuardaVanoSaliente: 'presente' | 'ausente'`, opcional.

- **Tres estados, y el tercero es el que importa:** presente · ausente · **campo ausente = NO CONSTA**.
  Que nadie lo haya declarado no dice que el vano lleve guarda. Tratar el hueco como un «sí» pintaría de
  sana una línea que nadie ha comprobado (`ADR-029/032`).
- **A la siguiente ESTRUCTURA, no al siguiente punto.** Un empalme no sostiene conductor —en esta línea
  hay uno dentro del vano E06→E07— y tomarlo como extremo partiría un vano real en dos falsos (`40 §10`).
- **No entra en ningún cálculo** y no cambia el veredicto de ningún apoyo. Es inventario.
- **Se pinta sobre el mapa** (lo que pidió): funda blanca + discontinuo rojo oscuro, encima de los tramos
  de tensión y debajo de los apoyos, con su leyenda y sus metros. Sin dato **no se crea ni la capa**.
- **Se declara desde la aplicación**, en «Detalle GPS», vano a vano y con permiso de edición. Escritor
  propio con el mismo cerrojo de revisión que la ficha — **no** por la ficha estructural, cuyo molde
  rechaza por diseño lo que no da veredicto.
- **Las fotos salen gratis:** una evidencia ya puede colgar de un apoyo (`ADR-015`). Sin reglas nuevas.

### Alternativas descartadas

- **Molde general de «daño por tramo» con lista cerrada** (mi recomendación). El Ingeniero eligió
  **solo cable de guarda**. Queda escrito el coste que acepta: el segundo tipo de daño obliga a reabrir
  el contrato, y aquí abrir el contrato es de una sola dirección — desplegar antes, cargar después.
- **Reanimar `Hallazgo`.** Cuelga de un apoyo, exige una `Inspeccion` que no existe y arrastra severidad,
  origen y confirmación: seis campos inventados para guardar uno que consta.
- **Guardarlo en el frontend.** Es dato de red de un cliente y **este repositorio es público**. Ni un byte.
- **Guardar la causa o la fecha del daño.** El Ingeniero eligió *solo el hecho*: lo que consta es que
  falta, no cuándo ni por cuál falla.

### Consecuencias

- **Prerrequisito de `TODO-57`, no resultado:** `nFasesAmarradas` cuenta «las fases y, si lo lleva, el
  cable de guarda». En E06, E09, E21 y E22 el guarda muere y esas estructuras se llevan su tiro por un
  solo lado — el desequilibrio que calcula el eje longitudinal. Hoy no mueve nada: siguen 0/25 sin ficha.
- **La memoria de cantidades deja de poder suponer** que la longitud de guarda es la de la línea.
- **Un defecto cazado en el banco, no en producción:** la marca se pintó primero de `#dc2626` sobre un
  tramo de tensión `#d63b3b` y **desaparecía justo encima de ese tramo**. Una marca de daño que se
  esconde da por sano un trozo señalado. Arreglo: funda blanca + color fuera de la paleta, con el color
  en el dueño único (`vistas/tramoColores.ts`) y **guardián que lo compara contra la paleta**.
- **Nada de esto sirve hasta que el dato esté cargado.** Desplegar primero, declarar después.

### Verificado en vivo (2026-08-21) — y la línea queda declarada ENTERA

Con el Chrome del Ingeniero, sobre producción y con su sesión. Se declararon los cuatro vanos y el
sistema los agrupó **solo**: **E06 → E09 · 607 m · 3 vanos** y **E21 → E22 · 295 m**, **902 m — 29,8 %
de la línea**. Se distinguen en el mapa contra los colores de tramo de tensión. Cero errores. (La medida
previa a mano daba 903 m / 29,9 %: la diferencia es el redondeo al metro de la matriz de distancias
frente a la precisión entera del motor.)

Preguntado por el resto, el Ingeniero contestó que **sí lleva guarda**, y se declararon los otros 20.
**24 de 24 vanos con respuesta**, así que ya no queda ninguno en «no consta» y ese 29,8 % es de la
línea entera — que es lo que la pantalla afirma ahora con esas palabras.

### El defecto de velocidad que salió al cargarla, y por qué importa

Declarar los 24 vanos destapó que **cada declaración tardaba ~25 s**. Causa: para que el mapa se
enterara, el escritor llamaba a `almacen.cargar()`, que **rehace el arranque entero** —sesión, token,
permisos, líneas, apoyos, expedientes y fotos— y pone la aplicación en fase «cargando», en la que
`App.tsx` sustituye la pantalla de la línea. Cada clic destruía y volvía a montar **la propia pantalla
desde la que se está declarando**, con su mapa.

**Es la misma piedra que este archivo ya tenía escrita DOS veces** (`refrescarLinea` y `guardarFicha`),
y se pisó con un mazo más grande. Arreglo: se parchea EL APOYO que la base aceptó, con el valor y la
revisión que **devuelve la escritura** —no los que se pidieron—, igual que `guardarAccion`. El mapa se
entera igual porque `apoyos` cambia de identidad. **Medido después: 4,6 s la primera vez (rehace el
mapa) y 1,0 s las siguientes.** Tres guardianes nuevos.

### Crudo de respaldo

*(sin comité. El dato de campo, lo medido y las preguntas están en la BÓVEDA —
`datos-campo/2026-08-21-cable-de-guarda.md`— y no en este repositorio, que es público: describe dónde
una línea en servicio no tiene protección contra descargas. Guardián ejecutable:
`tests/cable-de-guarda.test.js`.)*

---

## ADR-045 · 2026-08-21 · El atlas solar del Caribe: dato horario de 2026 sobre siete departamentos, en su propia pantalla

**Estado:** ✅ Decidido · ⚠️ **NO revisada externamente** · ✅ **auditada con Fable** · ✅ **verificado en vivo contra producción**

### Contexto

El Ingeniero: *«podríamos tomar los datos de índice de radiación solar de IDEAM o NASA POWER»* y, después,
*«el más reciente que esté […] y cada 2 meses verificar si hay alguna actualización»*, *«a lo largo de cada
día […] desde inicio del año 2026 en los departamentos de Bolívar, Córdoba, Sucre, Cesar, Magdalena,
Atlántico y La Guajira»*.

La capa de radiación que ya existía **no sirve para eso, y no es un defecto suyo**: cubre 0,29° × 0,38° (el
corredor de Cartagena), viaja en kWh/m² **al día** y son promedios de largo plazo por mes. Lo pedido es otra
cosa —6° × 6°, W/m² **horarios** y **días reales de 2026**— y por eso es otro producto, no una ampliación.

Las alternativas se descartaron **llamándolas** (`31 · L-64`): IDEAM no publica ninguna serie de radiación;
Cardique tiene las variables exactas y 741 filas (un mes de 2022); NSRDB, que a 4 km habría sido mejor, va
por 2023. NASA POWER es la única que cumple los tres requisitos a la vez.

### Decisión

**Producto nuevo, no ampliación del existente.** Los dos conviven y responden preguntas distintas.

- **Dato:** NASA POWER `ALLSKY_SFC_SW_DWN`, 36 celdas de 1° (CERES SYN1deg), sin clave. Un PNG en gris por
  mes —24 horas de ancho, un día por fila— y una ficha. **62 KiB los cinco meses.** El generador
  (`herramientas/sol-caribe.mjs`) va en Node **sin dependencias**, incluido su propio codificador PNG: tiene
  que correr igual en la Mac y en Actions, donde lo único garantizado es Node.
- **Mapa base propio:** `caribe.pmtiles`, 5,14 MiB, z0-10, extraído del build de Protomaps con la MISMA
  herramienta que hizo el del corredor. **Archivo aparte y perezoso**: quien no abra la pantalla descarga
  cero bytes. Reutilizar el del corredor no servía — medido: al zoom donde caben los siete departamentos
  cubre el **5,4 %** de la región.
- **Los nombres de los departamentos van aparte** (`caribe-departamentos.json`, geoBoundaries/ODbL): el mapa
  base trae las líneas divisorias pero **no los nombres**, y fronteras mudas no son un atlas.
- **Pantalla propia en `#/sol`**, no una pestaña: las 14 son funciones de UNA línea y mueren sin apoyos.
- **`nearest` explícito**, no `linear`: con celdas de 110 km, interpolar dibuja un degradado que nadie midió.
- **Las tres bandas de 2026 se dibujan distinto** —con horas, solo total del día, sin dato— y **las fechas
  viajan en la ficha, jamás en el código**: escritas en el código, la frontera miente en silencio en la
  siguiente reconstrucción y los colores siguen saliendo bonitos.
- **Vigía cada dos meses** (`.github/workflows/vigia-nasa.yml`): pregunta con TRES consultas y solo hace las
  36 si hay novedad; **propone, no publica**; y sus guardianes rechazan un archivo que traiga menos horas,
  que retroceda de fecha, que pierda meses o que se quede sin atribución.

### Alternativas descartadas

- **Ampliar la capa existente.** Otra fuente, otra unidad, otro recuadro y otro eje de tiempo: sería una
  capa que dice dos cosas.
- **Un solo `.pmtiles` fusionado** (8,93 MiB, probado): deja la pantalla en blanco al acercarse fuera de
  Cartagena.
- **Un atlas de «hora media por mes»** (0,059 MiB, lo propuso un agente): más barato y más bonito, pero es
  una climatología y él pidió **2026**.
- **Quitar el callejero para ahorrar**: medido, las calles son el 6-10 % de los bytes.

### Consecuencias

- **La hipótesis de los 1.000 W/m² queda con número y con mapa.** Medido sobre 2026: el máximo de medias
  horarias de la región es **1.027 W/m²** y **11 de las 36 celdas superan los 1.000 adoptados** — todas en el
  norte. En la celda de LN-627 el máximo es 999,8: al filo. **Para una línea en La Guajira, Atlántico o
  Magdalena la hipótesis actual sería optimista**, y esto es una plataforma para muchas líneas. No cierra
  `TODO-71`: son medias horarias y el pico instantáneo es mayor.
- **Dos regresiones propias, cazadas y cerradas**: el import estático de `prepararTeselas` fundió el trozo
  diferido del mapa con el de entrada (820 kB → 1.883 kB) — de ahí nace `datos/teselas.ts`; y `#/sol` no
  sobrevivía a la carga inicial.
- **La auditoría adversarial con Fable se pagó sola otra vez** (como en `ADR-042`): encontró un fallo GRAVE
  que ningún guardián veía porque vive en el estado de React y no en el módulo puro — cambiar de mes dejaba
  pintado el mes anterior con la etiqueta del nuevo. Midió la colisión sobre los archivos reales. Más cinco
  hallazgos menores, todos arreglados y verificados en vivo. → detalle en el commit `dfdb806`.
- **El vigía NO funciona hasta que el Ingeniero toque dos ajustes de GitHub** (ver `docs/10`).

### Crudo de respaldo

`research-archive/2026-08-21-workflow-atlas-solar-caribe.json` — las cuatro dimensiones del diseño con
sus medidas (peso del mapa base a cinco zooms, error de cuantización, desvío Mercator, reparto de bytes
por capa). 4 agentes, 0 fallos.
`research-archive/2026-08-21-auditoria-fable-atlas-solar.md` — la revisión adversarial ENTERA, tal cual
la devolvió, con lo que verificó a favor y lo que declaró no haber revisado.
Guardián ejecutable: `tests/sol-caribe.test.js`.


---

## ADR-046 · 2026-08-21 · Una capa que se pinta y no se puede APRECIAR: el criterio de `ADR-041/042` nunca cruzó a la capa hermana

**Estado:** ✅ Decidido · **NO revisada externamente** · ✅ **verificado en vivo** (producción, sesión
del Ingeniero, 2026-08-21).

### Contexto

Lo dijo el Ingeniero, y con esas palabras: *«la capa de radiación que estábamos trabajando la pude
apreciar mientras la incluías, sin embargo no puedo apreciarla en la página»*.

Se comprobó en PRODUCCIÓN, con su sesión, antes de tocar una línea de código. La capa **no estaba
rota**: el paquete servido era el mismo que el construido (`md5` idéntico), la ficha respondía 200, la
rejilla se pintaba, el clic devolvía el valor del punto y las 1.665 pruebas estaban en verde. Todo lo
que un guardián sabe mirar decía que sí.

Y aun así era inservible, por **dos cosas que este proyecto YA había resuelto** — en la capa hermana,
la de temperatura, y nunca trajo aquí:

1. **El encuadre** (`ADR-042`). El mapa arranca ceñido a la LÍNEA: 3.024 m. La rejilla del recurso
   solar tiene celdas de 2 km, así que dentro de ese encuadre caben dos o tres celdas con
   prácticamente el mismo valor — **una mancha de un solo color**. `LeyendaTemperatura` recibía
   `alEncuadrar` («Ver todo el recorte») desde el 20 de agosto; `LeyendaRadiacion` **no lo recibía**,
   y su comentario en `Mapa.tsx` ya advertía, palabra por palabra, lo que iba a pasar: *«sin una
   forma de llegar ahí de un clic, lo que el usuario concluye es que la capa está rota — y tendría
   motivos»*.
2. **La rampa fija** (`ADR-041`, `30 · L-61`). El sol seguía con una escala universal de 3,0 a
   7,5 kWh/m² al día, elegida «para que dos recortes distintos se pudieran comparar». Medido sobre
   los archivos reales: las trece capas ocupan el **48 %** de esa escala y la **media del año —que es
   la capa que se abre por defecto— el 11 %**. Es exactamente el fallo que `ADR-041` corrigió en
   temperatura tras pedirlo él, y cuyo argumento («no amplificar ruido») ya se declaró equivocado:
   confundía el error ABSOLUTO del modelo, común a todas las celdas, con el RELATIVO entre vecinas.

### Decisión

**Un criterio corregido se propaga a TODA la familia, y se deja un guardián que lo vigile.**

- **`LeyendaRadiacion` recibe el encuadre**, y el encuadre pasa a tener **un solo dueño**:
  `encuadrarRecorte` vive en `Mapa.tsx` y las dos leyendas lo reciben. Nació dentro de una de ellas y
  por eso no llegó a la otra.
- **La rampa del sol se ajusta al recorte**, calculada sobre las **trece capas a la vez** —nunca por
  mes— y **publicando la escala**: *«el rojo NO significa sol extremo, significa unos 2,30 kWh/m² al
  día más que el azul»*. Rampa nueva: **4,30 … 6,60**, que el dato ocupa al **94 %**.
- **La mecánica de la rampa tiene un dueño único** en el generador (`_rampa_ajustada`), que usan las
  dos capas. La de temperatura se recalculó y sale **idéntica** a la publicada: cero regresión.
- **El generador aprende `--reusar` para el sol.** Lo tenía la temperatura y no el sol, y eso era lo
  único que hacía parecer cara esta corrección: sin él, cambiar un color costaba **352 peticiones** a
  un servicio ajeno. Con él costó cero.
- **De propina, el vacío del atlas deja de parecer una avería**: fuera de los 6°×6° de
  `caribe.pmtiles` el fondo se pinta del color del papel del sitio y no del gris del mapa base.

### Alternativas descartadas

- **Una rampa por mes.** Daría el contraste máximo y **rompería la comparación entre meses**: el
  mismo color sobre valores distintos. Es lo único que la escala fija sí protegía, y se conserva.
- **Volver a muestrear el Global Solar Atlas.** 352 peticiones a un servicio de otro para cambiar un
  color. Las rejillas guardan el **byte**, no el color: no había ni un valor que rehacer.
- **Dejar la escala fija «por comparabilidad entre recortes».** Ese argumento ya se cayó en
  `ADR-041`, y además **hoy solo existe un recorte**: se estaba pagando un precio real por una
  comparación que nadie puede hacer.
- **Estirar la rampa sin publicar la escala.** Es como se fabrica un gradiente que no existe. El
  aviso va SIEMPRE, no solo cuando el recorte sale plano.

### Consecuencias

- La capa **se aprecia**: en marzo, del punto más flojo al más soleado del recorte hay
  **0,72 kWh/m² al día**, y ahora eso se ve y se lee escrito.
- **Once pruebas nuevas** (`tests/radiacion.test.js`), y tres son el guardián del hueco de verdad:
  que **las dos** leyendas reciban el encuadre, que el encuadre al recorte tenga **una sola** copia y
  que las trece capas ocupen **más del 80 %** de la rampa. Sin ellas, la próxima capa repite el
  fallo.
- **Lección `32 · L-65`**: una corrección de criterio es una deuda con toda la familia de módulos,
  no con el módulo donde se descubrió.
- Lo que **NO** cambia: sigue siendo ENERGÍA DIARIA y la ampacidad sigue comiendo una IRRADIANCIA
  INSTANTÁNEA de 1.000 W/m² ADOPTADOS. Esta capa **no cierra `TODO-71`** y lo dice en pantalla.

### Crudo de respaldo

Sin comité: es la aplicación de un criterio ya deliberado (`ADR-041/042`) a un módulo que se quedó
fuera. Guardián ejecutable: `tests/radiacion.test.js`. Verificación en vivo: producción con la sesión
del Ingeniero, capa encendida, «Ver todo el recorte» pulsado y mes cambiado a marzo.


---

## ADR-047 · 2026-08-21 · Mantenimiento integral del cerebro: 28 huecos que el linter no podía ver, y el nodo del mapa se parte

**Estado:** ✅ Decidido · **NO revisada externamente** · ✅ auditoría Nivel-2 corrida y archivada.

### Contexto

Lo pidió el Ingeniero con una frase que es un diagnóstico: *«estás dejando muchos huecos al momento
de solicitarte que documentes todo»*. Y tenía razón medible. El linter decía **CEREBRO SANO** el
mismo día en que:

- La fila «Producción» del `05` —nodo que se auto-carga en CADA arranque— seguía diciendo que lo
  último desplegado era el mapa de temperatura del 20-08. Tres olas después. El propio nodo se
  contradecía consigo mismo ocho líneas más abajo.
- El índice de lecciones enrutaba `L-60`, `L-61` y `L-62` al **hijo equivocado**: quien los buscara
  ahí concluiría que no existen.
- La cabecera de ese índice, que se declara a sí misma *«la ÚNICA cifra válida»*, decía **57**
  lecciones cuando eran **64**.
- `ADR-031` afirmaba *«ni ha entrado una sola foto por esta vía»* con las **205** dentro.
- El disparador de la auditoría profunda estaba **muerto por construcción**: el linter calcula
  `gap = coveredHeaderCount ? headers - coveredHeaderCount : 0` y el manifiesto tenía
  `coveredHeaderCount: 0`, así que el aviso «hay muchos ADRs sin auditar» **no podía saltar nunca**.
  Del 28-07 al 21-08: **32 ADRs nuevos sin una sola pasada semántica**, y verde todo el tiempo.

Es `ADR-021` repitiéndose con nombre y apellido: **el linter valida ESTRUCTURA, no VERDAD**.

### Método

Auditoría Nivel-2 con **6 lentes independientes** (frescura de los nodos always-on · trabajo hecho y
no documentado · contradicciones y SSoT · **criterios adoptados en un módulo y no propagados a su
hermano** · capacidad y poda · bóveda, crudos y pendientes) y **un refutador por hallazgo**, con la
consigna *«ante la duda, NO real»*. 49 agentes Opus, 4,45 M tokens, 0 fallos.

**43 hallazgos, 28 confirmados y 15 tumbados por la refutación** — incluido uno que citaba un archivo
que esta misma sesión ya había corregido. La refutación no solo filtra al auditado: filtra al auditor.

### Decisión

**Cerrar los 28 en el mismo turno**, y donde el hueco lo permitía, dejar un guardián en vez de una
buena intención:

1. **Verdad de los nodos:** `05` (producción, fecha, «25 apoyos» que decía 24), `30` (recuento y las
   tres lecciones mal enrutadas), `20` (13 pestañas → las pestañas viven en `05`; alta de
   `SolCaribe`, `RedDeSeguridad`, `cableGuarda`, `solCaribe`, `radiacion`; las dos carpetas de la
   bóveda que faltaban), `ADR-031` (estado corregido por apéndice, nunca reescribiendo el cuerpo).
2. **El disparador muerto se enciende:** `coveredHeaderCount: 46` y el porqué del cero **escrito** en
   el manifiesto, para que nadie vuelva a leer ese `maxAdrGap: 12` como si vigilara algo.
3. **El nodo del MAPA se parte a `docs/34-LECCIONES-MAPA.md`.** `32` estaba al **118 %** de su tope y
   el archivo ya traía la frontera dibujada por dentro: sus dos secciones son «el mapa que no llega a
   pintarse» y «del cálculo a los ojos». Se parte por ahí. Los `L-NN` **no se renumeran** (`ADR-016`).
4. **Poda por consolidación, nunca por borrado:** el «porqué» de los dueños únicos de `vistas/` se
   MUEVE del mapa al `§ADR-018`; el estado de revisión de `ADR-027/028/029`, que vivía **solo** en la
   tabla del `00`, se rescata a su ADR ANTES de destilar la tabla; `00` deja de ser un segundo
   historial y vuelve a ser índice.
5. **Dos lecciones nuevas** de lo que la auditoría destapó: `34 · L-65` (un criterio corregido es
   deuda con toda la familia) y `32 · L-66` (una escritura no recarga la aplicación: parchea lo que
   la base devolvió — una piedra que este proyecto pisó **tres veces** y nunca escribió).
6. **Un defecto de producto que salió de rebote:** el vocabulario del ORIGEN de un dato tenía dueño
   único declarado y **tres traducciones rivales** conviviendo. `Sello.tsx` guardaba su propia lista
   con cinco entradas, **dos inexistentes en el contrato** (`medido`, `calculado`), y le faltaban
   cuatro de las siete reales: para ésas **imprimía el identificador crudo** —`documento_proyecto`—
   al pie de una tabla firmable. En un producto cuya razón de ser es la trazabilidad, eso no es
   cosmético. Un solo dueño, dos registros (ficha y sello), y una prueba que **recorre los siete**.
7. **El dato de campo que no llegó a ningún nodo:** *«ningún apoyo tiene retenida, todos son
   autosoportados»* entra a `40` con lo que cierra —el modo de error de falsa alarma— y lo que
   **deja vivo**, que es el peligroso (`TODO-76`).

### Alternativas descartadas

- **Subir los topes para que el linter calle.** Es fabricar el verde que este proyecto desprecia
  (`ADR-021`, `30 · L-56`). El único tope que se movió es el de **líneas** de la madre `30`, y por
  una razón escrita: la madre es un ÍNDICE que crece una línea por lección, y su presupuesto real es
  el de caracteres (31k de 40k), que no se tocó.
- **Reescribir los ADRs viejos** para que digan la verdad de hoy. Un ADR se **apenda** (`§2`): el
  estado de `ADR-031` se corrige con un párrafo fechado, y el cuerpo original se queda como estaba.
- **Dejar el shard para después.** El `32` bloqueaba commits del cerebro y la familia entera está
  al 90 % de su tope: aplazarlo era heredar el problema a la siguiente ola.

### Consecuencias

- **`brain:check` verde de verdad**: 13 neuronas, todas dentro de su tope, boot en 31.484 c de 31.500.
- **65 lecciones** en 4 hijos + método, con las referencias resolviendo (65 usadas / 65 definidas).
- **1.687 pruebas** (10 más que al empezar) y **tres guardianes nuevos** donde antes había comentario:
  el espejo de la versión del contrato, el vocabulario del origen y el encuadre de las dos capas.
- Queda dicho lo que **no** se hizo: `31` y `33` siguen al 99 % de su tope. El siguiente shard de la
  familia es una decisión suya, no un reflejo.

### Crudo de respaldo

`research-archive/2026-08-21-auditoria-cerebro-6-lentes.json` — los 43 hallazgos con su evidencia
`archivo:línea` y, para los 15 descartados, **por qué** se cayeron. Guardianes ejecutables:
`tests/radiacion.test.js`, `tests/ficha-estructural.test.js`, `tests/contrato-evidencia.test.js`.


---

## ADR-048 · 2026-08-21 · La familia de lecciones se parte por donde ya estaba partida, y el techo real es el ARRANQUE

**Estado:** ✅ Decidido · **NO revisada externamente**.

### Contexto

`ADR-016` partió el nodo de lecciones en madre + 3 hijos y dejó escrito el presupuesto: cada hijo
arranca en ~110-130 líneas y su tope de 260 líneas / 20.000 caracteres «le deja sitio para unas 13
lecciones más». La estimación se quedó corta porque **aquí una lección ocupa entre 1.400 y 3.000
caracteres**, no las ~700 que suponía ese cálculo. Resultado, al cerrar `ADR-047`: `32` al **118 %**,
`31` al **99 %** y `33` al **99,9 %**. El linter pedía «SHARD/poda» y bloqueaba commits del cerebro.

### Decisión

**Se parte por la frontera que cada archivo ya traía escrita por dentro, no por una nueva.**

- **`32` → `32` + `34`** (hecho en `ADR-047`): sus dos secciones eran «el mapa que no llega a
  pintarse» (7 lecciones) y «del cálculo a los ojos» (11). Corte limpio y equilibrado.
- **`31` → `31` + `35`**: sus dos secciones eran «lo que se firma y lo que se paga» (8) y «cuando el
  proveedor no deja entrar ni leer» (7). Y el corte no es solo de tamaño, es de **momento**: `31` se
  consulta **ANTES** de contratar —licencia, coste, si se puede usar en un trabajo que se factura— y
  `35` **DESPUÉS**, cuando el tercero ya está contratado y aun así el dato no llega. Son dos
  preguntas de dos días distintos: tenerlas en un archivo obligaba a leer las dos siempre.
- **`33` NO se parte, y se dice por qué.** Su frontera interna reparte **3 contra 12** (el dato que
  no puede salir: `L-07`, `L-23`, `L-50` · el número que se firma: las otras doce). Un nodo de tres
  lecciones cuesta una fila **permanente** en el router always-on y ahorra poco. Queda al 99,9 %:
  **la siguiente lección de ese tema obliga a decidir entre poda y corte**, y esa decisión es del
  Ingeniero (`TODO-78`).

### El techo real, que no es el tope de cada hijo

Cada neurona nueva paga una fila en `CLAUDE.md §0`, que es **always-on**: se lee entera en cada
arranque. El gate `boot-gate` la cierra en 31.500 caracteres y hoy va en **31.493 — siete de
margen**. O sea que **el número de hijos ya no lo limita el tamaño de los hijos: lo limita el
arranque.** Los dos cortes de hoy se pagaron destilando el propio router (dos párrafos que decían lo
mismo con más palabras). Ese pozo no es infinito.

Se deja escrito para que la próxima vez no se descubra a mitad de un corte: **antes de partir una
neurona, mirar el margen de arranque, no solo el tope del hijo.**

### Alternativas descartadas

- **Subir los topes de los hijos.** Fabricar el verde (`ADR-021`, `30 · L-56`).
- **Subir el objetivo de arranque de 31.500.** Es el presupuesto de contexto que se paga en CADA
  sesión, la cifra que más cuesta de todo el cerebro. Se destila el router, no se sube el techo.
- **Comprimir los cuerpos de las lecciones.** Es lo primero que se ofrece y lo peor que se puede
  hacer: la lección ES el activo. Se poda lo que se REPITE (una cabecera que enumera lo que ya está
  en el índice de la madre) y jamás el síntoma, la causa o la regla.
- **Colapsar las cinco hijas en una fila del router.** El gate #10 exige registro DIRECTO de cada
  neurona: una hija que el router no nombra es una hija huérfana.

### Consecuencias

- Familia de lecciones: madre + **cinco** hijos (`31` licencia y coste · `32` pantalla · `33` núcleo
  y dato · `34` mapa · `35` acceso y portales). 65 lecciones, todas las referencias resolviendo.
- `31` baja de 19.753 a **8.187** caracteres y `35` nace con 12.566: los dos con sitio para años.
- **Y el `00` vuelve a ser un índice.** Su tabla de ADRs se había convertido en un segundo historial:
  48 filas de ~250 caracteres —resumen de la decisión Y su estado de revisión— que se llevaban el
  **79 %** del nodo y se desincronizaban solas. Se comprobó primero que los **48** ADRs llevan su
  línea `**Estado:**` en `99`, o sea que la tabla no era el dueño de nada: solo la copia. Ahora cada
  fila es `ADR · fecha · TÍTULO · crudo`, ordenada por número. **De 16.271 a 12.199 caracteres**, y
  sitio para unas quince decisiones más antes de volver a mirar.
- El enrutamiento por síntoma de `CLAUDE.md §G.2` y de `00` distingue ahora **licencia/coste** de
  **no me deja entrar**, que era la confusión más común al buscar.

### Crudo de respaldo

Sin comité: es la aplicación del mecanismo de `ADR-016` a dos hijos que llegaron a su tope, con las
medidas de `brain:check` de este mismo día. Guardián: el propio gate de capacidad y el `boot-gate`.


---

## ADR-049 · 2026-08-22 · Triaje de los 51 hallazgos del entorno, y las dos mentiras que salieron vivas del que se dio por cerrado

**Estado:** ✅ Decidido · **NO revisada externamente** · las dos correcciones, ✅ **verificadas en
vivo** contra producción.

### Contexto

La auditoría del entorno del **2026-08-09** dejó 51 hallazgos con `archivo:línea`. Nadie los trió:
unos se cerraron sin dejar rastro documental y de otros nadie sabía (`TODO-77`). Doce días y
diecinueve ADRs después, el crudo ya no podía decir qué quedaba vivo.

### Método

Cinco agentes, uno por bloque del plan, contra el código de HOY. Y **un refutador por cada
hallazgo que se declarara cerrado**, con la consigna *«demuestra que sigue vivo; ante la duda,
VIVO»*: declarar cerrado algo que sigue vivo es el error peligroso, porque se deja de mirar.

**El resultado incomoda: de los 7 que se dieron por cerrados, la refutación bajó 5 a PARCIAL.** Y el
patrón es siempre el mismo, el de `34 · L-65`: **arreglado donde se veía, vivo en la pieza hermana.**

- El **sello de trazabilidad** se corrigió en pantalla el 21-08 (`ADR-046`) y sigue imprimiendo el
  identificador crudo en el **informe firmable** (`exportar/informe.js:331`), en las tablas de
  cantidades y en el **CSV de compras** — donde una prueba llegaba a EXIGIR la jerga.
- La **red de seguridad** cubre la aplicación entera… menos el mapa, que tiene la suya propia,
  escrita más cerca, **sin registro en consola y con un texto falso** («El mapa no se pudo
  descargar» cuando lo que falló fue dibujar). Justo las dos pantallas de más piezas móviles.

Dos refutaciones murieron por límite de uso; sus hallazgos se re-comprobaron a mano y quedaron
**cerrados**. Cuenta final: **43 vivos · 5 parciales · 2 cerrados**.

### Decisión

**Cerrar en el mismo turno los dos hallazgos en los que el producto MIENTE**, y dejar el resto
triado con evidencia fresca para que se decida con datos.

**1 · El formulario se vaciaba aunque no se hubiera guardado nada.** Las cuatro escrituras del
expediente se tragan el fallo a propósito —lo convierten en la franja roja— y devolvían `void`: su
`await` terminaba bien aunque no se escribiera nada. Y quien llamaba vaciaba igual. Tres sitios:

| Dónde | Qué se borraba |
|---|---|
| **Declarar la causa raíz** (`Rca.tsx`) | el enunciado recién redactado y el nodo elegido |
| **Congelar el sondeo de IDEAM** (`RcaEditores.tsx`) | la consulta entera — y hay que volver a pedírsela a un portal que este proyecto tiene documentado que se cuelga 90 s |
| **Crear una acción correctiva** (`RcaEditores.tsx`) | el texto de la acción |

Y encima la franja decía, en negrita, *«Lo que escribiste sigue en pantalla y no se ha perdido»*.
**Mentía**, en el acto más caro del expediente y al final de una pantalla tan larga que el aviso ni
se ve. Ahora las cuatro devuelven `Promise<boolean>` y el formulario **solo se vacía si la base
confirmó**. El patrón ya existía en la casa: `FichaEditor.tsx` lo hacía bien.

**2 · Dentro del expediente, «no hay» y «no se pudo mirar» se decían igual.** El tercer estado se
había puesto en la pestaña Falla y en la galería de la línea (`ADR-032`, `32 · L-44`) y **no** dentro
del análisis: tres `catch` vacíos en `#abrirAnalisis` y la pantalla afirmando «este análisis no tiene
ninguna evidencia disponible». Con esa frase delante se descarta una familia de causas *por falta de
evidencia* con las fotos existiendo — y eso entra en un informe firmado. Ahora el motivo viaja en el
estado y la pantalla lo dice en ámbar, añadiendo lo que **no** se debe hacer con ella en ese estado.
Lo mismo en la ficha del apoyo, que decía «No hay fotografías cargadas de E07» sin haber podido leer.

### Alternativas descartadas

- **Que las escrituras vuelvan a lanzar el error.** Rompería lo que `ADR-032` ganó: el fallo de
  escritura vive en el estado, no en una excepción que cada pantalla trate a su manera.
- **Ablandar la frase de la franja** («puede que se haya perdido»). Es rendirse: la frase era
  correcta como intención; lo que estaba mal era el código. Ahora se cumple, y una prueba la ata.
- **Arreglar los 43 vivos de una tacada.** Varios son decisiones suyas —la escala de verosimilitud
  de tres o cinco valores, ordenar la lista de expedientes— y otros tocan el molde de los datos.
  Triados y priorizados, no ejecutados a ciegas.

### Consecuencias

- **Ocho pruebas nuevas** y la lección `32 · L-67`: **un guardián que vigila la función y no a quien
  la llama cubre media carrera.** El de 15-08 estaba en verde mientras el trabajo se perdía.
- Queda `TODO-79` con los **43 vivos + 5 parciales**, ordenados por gravedad, en el crudo.
- Los dos restos más caros del lote parcial —el identificador crudo en el **informe firmable** y la
  red del **mapa** que se traga el fallo— quedan nombrados con su `archivo:línea`.

### Crudo de respaldo

`research-archive/2026-08-22-triaje-51-hallazgos-entorno.json` — los 50 hallazgos con su estado de
hoy, evidencia `archivo:línea`, qué le pasa al usuario y el arreglo concreto. Guardián ejecutable:
`tests/rca-fallo-guardar.test.js`.


---

## ADR-050 · 2026-08-22 · La escala de verosimilitud son TRES, y una hipótesis rival se cierra yendo a probarla — no con una etiqueta

**Estado:** ✅ Decidido **por el Ingeniero** · **NO revisada externamente** · ✅ **verificado en vivo**
en producción con su sesión.

### Contexto

La auditoría del entorno dejó este hallazgo abierto con una decisión pendiente suya: *«¿la escala son
tres valores o cinco?»*. El desplegable de la pantalla ofrecía **cinco** —`descartada`, `baja`,
`media`, `alta`, `confirmada`— y el molde (`contratos/src/eventos.ts`) admite **tres**. Elegir
cualquiera de las dos que sobraban hacía que el contrato rechazara el guardado, y eran justo las dos
con las que se cierra un análisis. La suite estaba en verde porque **las pruebas del motor usaban
esos valores**: el oráculo bendecía lo imposible (`30 · L-33`).

Al ir a implementarlo apareció algo más grande, y hay que decirlo antes que nada:

> **Hoy una hipótesis rival no se puede cerrar por NINGUNA vía, y por lo tanto un expediente con más
> de una hipótesis no se puede cerrar.**

Las dos vías existían y las dos estaban rotas:

1. `verosimilitud: 'descartada'` — la pantalla la ofrecía y **el molde la rechazaba**. Vía muerta.
2. `queSeHizo` + `resultado` (qué se hizo para probarla y cómo quedó) — la vía que el método declara
   **la buena** (`99 §ADR-026`: *«no exige un veredicto: exige que conste QUÉ SE HIZO y CÓMO
   QUEDÓ»*). Está en el molde (`contratos/src/rca.ts`) y el motor la exige en la séptima condición…
   y **no existía en ninguna pantalla**. Nadie podía escribirla.

Con las dos rotas, la séptima condición de cierre era **inalcanzable** en cuanto hubiera una
hipótesis que no fuera «alta». Es `33 · L-45` con nombre y apellido: una regla que el motor calcula
y ninguna pantalla consume.

### Decisión

**Tres valores** (`alta` · `media` · `baja`), y la vía de cierre es **una sola**: ir a probar la
hipótesis y escribir qué se hizo y cómo quedó.

- **La escala se LEE del molde, no se copia.** `VEROSIMILITUD_UI = Verosimilitud.options`. El fallo
  no fue tener cinco: fue tener **dos listas**. Ahora hay una, y una prueba vigila que nadie vuelva
  a escribir un `<option>` a mano.
- **Se construye la pieza que faltaba**: en cada hipótesis, «qué se hizo para probarla» y «cómo
  quedó» —`resistió` · `refutada` · **`no concluyente`**—. Ese tercero cierra la rival igual, y es
  deliberado: obligar a concluir fabricaría la certeza que este método existe para impedir.
- **El motor se alinea.** Se retiran las ramas de `confirmada` y `descartada`, que ningún dato válido
  podía disparar, y con ellas las dos pruebas que las bendecían. Medido antes de tocar: `confirmada`
  era un **sinónimo exacto** de `alta` —no aportaba ni un comportamiento— y `descartada` solo servía
  para dos cosas, saltarse el respaldo y salir del recuento de rivales.
- **Y toda hipótesis necesita respaldo, sin excepción.** `descartada` eximía del defecto «sin
  evidencia enlazada». Sin ella, la regla queda igual que la que ya rige para las familias de causas:
  *tumbar algo también exige decir con qué*.

### Alternativas descartadas

- **Subir el molde a cinco valores** (lo que la auditoría creía «lo más probable»). Se midió y no se
  sostiene: `confirmada` no aporta nada que `alta` no haga ya, y `descartada` es una etiqueta que
  saca una hipótesis del tablero **sin haber ido a probarla** — justo lo contrario de lo que pide la
  séptima condición. Cinco valores habrían dado una puerta trasera con aspecto de rigor.
- **Recortar el desplegable a tres y ya.** Era el atajo, y habría dejado el expediente **sin ninguna
  forma de cerrar una rival**: peor que el fallo original, porque el análisis no cerraría nunca y
  nadie sabría por qué.
- **Tocar solo la pantalla y dejar el motor leyendo cinco.** Es la divergencia que causó todo esto.

### Consecuencias

- **La séptima condición pasa de inalcanzable a alcanzable.** Un expediente con hipótesis rivales
  se puede cerrar por primera vez — diciendo qué se hizo con cada una.
- **1.700 pruebas** (5 nuevas) y un guardián que ata el desplegable al molde.
- Quien tenga hipótesis ya guardadas no pierde nada: `descartada` y `confirmada` **nunca pudieron
  guardarse**, así que no hay un solo dato que migrar.
- Cambio de criterio declarado: una hipótesis «baja» **ya no cuenta como cerrada**. Bajarle la
  verosimilitud es una opinión sobre ella; cerrarla es haber ido a mirar.

### Crudo de respaldo

La decisión es del Ingeniero (2026-08-22), sobre el hallazgo nº 1 de «Mentirá en cuanto cambie una
lista» del triaje (`research-archive/2026-08-22-triaje-51-hallazgos-entorno.json`). Guardianes:
`tests/rca-contrato-parte.test.js` y `tests/rca.test.js`.


---

## ADR-051 · 2026-08-22 · Lo primero que se ve tiene que ser verdad: la banda, la pestaña, el tope y la versión del motor

**Estado:** ✅ Decidido · **NO revisada externamente** · ✅ **verificado en vivo** en producción con
la sesión del Ingeniero.

### Contexto

Primera fase del saldo del triaje (`ADR-049`) sobre **la página**, y se eligió por un criterio:
**cerrar lo que la página AFIRMA y no es verdad**, antes que lo que se ve apretado. Cuatro cosas, y
las cuatro compartían la misma forma — una señal que no mira el dato:

1. **La banda «Cálculo mecánico», siempre en verde.** El número de tramos excedidos estaba
   **fijado a cero en el código** (`const excedidos = 0`) y el tono escrito a mano como «bien». Si
   la pestaña Mecánico mostraba tramos por encima del umbral, el Resumen seguía verde. Era la única
   de las cuatro fichas de la banda que no derivaba del dato — y mentía hacia el lado peligroso:
   lo primero que ve quien dirige el mantenimiento es un punto verde, y no entra.
   De regalo, `sin tramos` **también** salía verde: un hueco pintado de aprobado (`32 · L-44`).
2. **La pestaña «Falla», siempre en rojo**, tuviera expedientes o ninguno, mientras dentro decía
   «esta línea no tiene ningún expediente». Una alarma que suena siempre deja de ser una alarma.
3. **El tope de tiro tenía DOS dueños.** `nucleo/umbrales.js` lo leía de la **hipótesis** —bien, con
   su procedencia publicada— y las pantallas leían un `0,5` escrito en código. Hoy cuadraba **por
   suerte**: nadie había declarado un tope propio. El día que se declarara, Umbrales habría evaluado
   contra el valor declarado mientras Fundamentos y Mecánico seguían con el 50 — **dos veredictos
   distintos sobre el mismo tramo**. Y dentro de la MISMA tarjeta de Fundamentos, la **figura** ya
   dibujaba el tope declarado mientras el **texto** decía 50 %: dibujo y letra en desacuerdo.
4. **El sello decía «Motor v0.1.0»** desde hacía dos semanas y media, con las acciones correctivas,
   las causas raíz en plural, la barrera de contención, cinco familias nuevas y la capacidad
   longitudinal dentro. Dos informes calculados con motores que juzgan distinto salían firmados con
   el mismo número: la trazabilidad convertida en adorno.

### Decisión

- **La banda cuenta de verdad**, y lo cuenta el **mismo dueño** que la pestaña Mecánico
  (`vistas/tramos.ts`), no una segunda cuenta. Con tramos excedidos pasa a «atender» y los nombra;
  sin un solo tramo calculado, también — porque eso no es un aprobado.
- **El rojo de «Falla» sale del número de expedientes ABIERTOS.** Ninguna pestaña vuelve a llevar el
  color escrito en la lista.
- **El tope de tiro tiene UN dueño**: `topeDeTiro(hipotesis)` en `nucleo/mecanica.js`, que devuelve
  el porcentaje **y de dónde salió** —`hipotesis_declarada` o `criterio_clasico`—. Las tres pantallas
  lo piden con la hipótesis, y el texto que lee el Ingeniero **imprime esa procedencia**: el 50 no se
  presenta como norma, se presenta como la costumbre heredada que es. `tiroMaximoAdmisible(rts)`
  sigue funcionando con un solo argumento: la firma es aditiva.
- **La versión del motor sube a 0.2.0**, y **un guardián de `pre-commit` la ata**: si cambia algo de
  `nucleo/` y su `version` se queda igual, el commit se bloquea con el porqué. Probado en los dos
  sentidos antes de darlo por bueno.
- **Se retira la copia dormida** `dibujarTramos` (47 líneas): una segunda tabla de tramos completa,
  con su propio tope y sus propios textos, que **no llamaba nadie**. Mientras estuvo ahí, quien fuera
  a corregir un texto podía corregirlo en la copia equivocada y creer que quedó hecho (`30 · L-28`).

### Alternativas descartadas

- **Que la banda recalculara los excedidos por su cuenta.** Es el mismo error que se está cerrando:
  dos cuentas del mismo número acaban en dos pantallas que dicen cosas distintas.
- **Dejar el rojo de «Falla» fijo «porque una línea con expedientes siempre los tendrá».** Falso: un
  expediente se cierra, y el color tiene que apagarse con él.
- **Subir el tope al molde como campo obligatorio.** Habría obligado a declarar un criterio que
  todavía está abierto. Se resuelve al revés: se admite que no esté, y se dice.
- **Bumpear el motor a 1.0.0.** Nada de esto está cerrado contra norma; un `1.0` diría lo contrario.

### Consecuencias

- **19 pruebas nuevas** (1.719 en total) en dos archivos nuevos, `tests/tope-de-tiro.test.js` y
  `tests/banda-y-pestanas.test.js`. La del tope es la que más vale: declara un tope propio —el caso
  que hoy no se da— y exige que el motor, la tabla de umbrales y la pantalla den el **mismo número**.
- Verificado en producción: la tabla de tramos de LN-627 tiene **7 filas y 0 excedidas**, así que el
  verde de la banda ahora es *cierto*, no *fijo*; y la pestaña «Falla» sale roja porque hay **1**
  expediente abierto, no porque esté escrito.
- Queda dicho lo que **no** se tocó: el `.pestana.roja` sigue ganándole el color al `.activa` cuando
  la pestaña roja está seleccionada. Con el rojo ya derivado del dato, esa combinación es legítima y
  el subrayado ámbar sigue marcando la selección; si molesta, es una línea de CSS.

### Crudo de respaldo

Hallazgos nº 1, 4, 7 y 8 de «Lo que ya miente» y nº 4 y 10 de «Mentirá en cuanto cambie una lista»
del triaje (`research-archive/2026-08-22-triaje-51-hallazgos-entorno.json`). Guardianes:
`tests/tope-de-tiro.test.js`, `tests/banda-y-pestanas.test.js` y el gate de `githooks/pre-commit`.
