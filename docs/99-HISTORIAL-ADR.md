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
