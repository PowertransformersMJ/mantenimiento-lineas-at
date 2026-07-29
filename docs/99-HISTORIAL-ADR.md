# 📜 99 — HISTORIAL DE DECISIONES (ADR)

> Memoria de largo plazo. **No se auto-carga**: se consulta por el trigger 🟢 vía `docs/00-INDICE.md`.
> Aquí vive el **porqué** de cada decisión cara de revertir. Se APENDA, nunca se reescribe.
> Formato: Contexto · Decisión · Alternativas descartadas · Consecuencias · Crudo de respaldo.

---

## ADR-001 · 2026-07-29 · Arquitectura y stack de la plataforma

**Estado:** ✅ Decidido · ⚠️ **NO REVISADO EXTERNAMENTE** (el Consejo Externo es `TODO-01`; hasta que
corra, esta decisión lleva esa marca por honestidad, según `CLAUDE.md §G.2` 🛰️).

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
| **Cálculo** | `nucleo/` — funciones puras, sin DOM ni red, con pruebas de oro | 45 pruebas en verde; desviación 4,5·10⁻⁶ m contra el original |
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
