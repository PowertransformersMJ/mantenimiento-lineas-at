# 🧪 30 — LECCIONES (Memoria Procedimental) · índice de la familia + método

> Nodo de experiencia. NO se auto-carga: se consulta **antes** de una operación riesgosa o repetitiva
> (trigger 🧪 de `CLAUDE.md §G.2`). Cada lección es un gotcha que ya se pagó una vez.
> Formato: `L-NN · título` → **Síntoma** / **Causa** / **Regla**.
>
> **Qué es este archivo:** el ÍNDICE de las 42 lecciones —**33 repartidas por tema en tres hijos y
> 9 de MÉTODO aquí mismo, completas**: cómo se delibera, cómo se verifica y cuándo algo está de
> verdad terminado—. Las de método se quedan porque no son de ninguna pieza: valen para las tres, y
> son las que más se citan desde otras neuronas. Si el síntoma huele a un tercero, a lo que se ve o
> se abre, o al número que se firma, el índice te manda directo al hijo: no hay que leerse los
> cuatro archivos.
>
> **Los identificadores NO se renumeran nunca.** Un `L-NN` citado en otra neurona o en un comentario
> del código sigue apuntando al mismo gotcha, viva donde viva su cuerpo. Y ojo con la aritmética: los
> números llegan hasta 43 pero las lecciones son 42 — el 14 se fusionó en `L-13` y no existe.
>
> ⚠️ **ANTES de escribir una lección nueva, busca el SÍNTOMA en los cuatro archivos.** Desde que la
> familia se repartió, ninguno se lee entero, y el 04-08-2026 se escribió `L-36` sin ver que `L-22`
> ya decía lo mismo. La cuenta de arriba es la ÚNICA cifra válida de cuántas lecciones hay: los demás
> nodos apuntan aquí y no la repiten, porque repetida se pudre (llegó a estar mal en cuatro sitios).

---

## Índice completo

### `docs/31-LECCIONES-PROVEEDORES.md` — lo que depende de un TERCERO: su factura, su licencia o su SDK

- `L-01` · GitHub Pages no puede servir este proyecto
- `L-02` · "Gratis" y "sin tarjeta" no son lo mismo
- `L-03` · MapTiler gratis prohíbe el uso comercial; Protomaps no
- `L-04` · A esta escala, el coste de almacenamiento NO es el criterio de decisión
- `L-10` · El módulo de campo NO es 100 % offline: el mapa se cae sin señal
- `L-11` · IndexedDB: una capa opcional tumbó el acceso al dato, y lo hizo DOS veces
- `L-12` · Dos trampas de Firebase Auth que rompen el ingreso sin avisar
- `L-13` · El ingreso explícito exige TRES piezas, y ninguna avisa de que falta
- `L-22` · Desplegar el código sin desplegar las reglas de Firestore: el dato existe y no llega
- `L-25` · Un alta «gratuita» puede esconder un formulario de pago, y ahí Claude se detiene
- `L-37` · Un portal de datos abierto miente de tres formas: la consulta que se cuelga, la estación que no mide lo que crees, y el campo con lat/lon intercambiadas
- `L-38` · Cuando la defensa canónica exige plan de pago, se DETECTA en vez de PREVENIR — y se escribe que es un compromiso, no un descuido

### `docs/32-LECCIONES-PANTALLA.md` — el cálculo salió bien y el usuario ve otra cosa: despliegue, cachés, mapa, imágenes, cifras

- `L-15` · El worker de MapLibre nace muerto en producción si no se le da su URL
- `L-16` · Chrome congela el reloj de animación en pestañas ocultas — y eso engaña dos veces
- `L-18` · Un despliegue no está vivo hasta que lo ves EN LA PESTAÑA
- `L-20` · La pantalla no puede prometer lo que el archivo no cumple
- `L-21` · "Se ve muy oscuro / no se ve de alto nivel" casi nunca es la paleta
- `L-26` · El núcleo escribe con PUNTO decimal, y en Colombia el punto son miles
- `L-27` · Una nota que el núcleo escribe POR FILA no se pinta por fila
- `L-30` · `loading="lazy"` no carga URLs `blob:` — y el fallo se lee como «faltan los datos»
- `L-35` · `deploy` NO construye: se puede desplegar un `dist/` rancio y no enterarse
- `L-36` · Recaída de `L-22`: las reglas de Firestore no se despliegan solas (el cuerpo vive en `31 · L-22`)
- `L-44` · Un tercer estado que la pantalla aplana se convierte en un aprobado

### `docs/33-LECCIONES-NUCLEO-Y-DATO.md` — el número que se firma y el dato que no puede salir de este repositorio

- `L-05` · El valor del HTML de 30 MB no es el HTML: son 115 funciones de ingeniería
- `L-06` · El núcleo se extrae sin pérdida — está verificado, no supuesto
- `L-07` · Los datos de cliente no entran en git, ni en repo privado
- `L-19` · Una regla de dominio se expresa como LISTA CERRADA, y la lista lleva guardián
- `L-23` · Una coordenada real dentro de una PRUEBA es una fuga igual que en el código
- `L-29` · Para afirmar que algo va en los DOS sentidos, mira el MENOR, no el mayor
- `L-31` · La seguridad que depende de que una variable ESTÉ no es seguridad
- `L-32` · Un guardián que cuenta INTENTOS no cuenta nada
- `L-40` · Si el núcleo solo publica la PROSA de un hueco, quien la lea deducirá el hecho — y mal (y una prueba escrita sobre la deducción la BLINDA)
- `L-41` · Un contrato que no se puede EJECUTAR en una prueba solo está revisado por el compilador
- `L-42` · Lo que un comité SUPONE entra al cerebro con el mismo rango que lo que verifica
- `L-45` · Una regla que el motor CALCULA y nadie consume no es una regla: es un comentario (y el grep de `L-28` da luz verde)

### `docs/30-LECCIONES.md` (este archivo) — método de trabajo: deliberar, verificar, cerrar

- `L-08` · Al comité se le da el problema crudo, no la conclusión ya pulida
- `L-09` · Los hechos que deciden la arquitectura se verifican con fuente, no de memoria
- `L-17` · El clasificador de esta sesión bloquea usar la llave admin de Firebase — planear la verificación con sesión de otra forma
- `L-24` · Un agente que muere deja código SIN VALIDAR, no código roto
- `L-28` · Un módulo construido y probado que ninguna pantalla llama es INVISIBLE
- `L-33` · Escribir la prueba y auditar el resultado son dos trabajos distintos
- `L-34` · Un fixture que DECLARA a mano lo que producción DERIVA ensaya otro camino
- `L-39` · Con la familia repartida, una lección nueva se DUPLICA si no buscas el síntoma en los cuatro archivos
- `L-43` · Un subagente que tiene que abrir muchas IMÁGENES se cuelga: eso se lee de a poco y en el hilo principal

---

## Método de trabajo — las lecciones que se quedan en la madre

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

### L-24 · Un agente que muere deja código SIN VALIDAR, no código roto
- **Síntoma:** 4 de 6 constructores cayeron con *«Connection closed mid-response»*. Sus módulos
  estaban escritos y la suite pasaba **418/418 en verde** — porque las pruebas que faltaban eran
  justo las de esos módulos. Verde total, cobertura cero en lo nuevo.
- **Por qué engaña:** el contador de pruebas que pasan SUBE igual (los otros agentes sí las
  escribieron), así que el tablero dice «todo bien» mientras dos módulos entran a producción sin que
  nadie los haya ejercitado.
- **Regla:** cuando un agente muere, **inventariar sus entregables uno a uno** —sobre todo
  `tests/`— y escribir a mano lo que falte ANTES de integrar. Un `npm test` verde no prueba que
  exista prueba. Emparenta con `L-28` y con `L-33`.

### L-28 · Un módulo construido y probado que ninguna pantalla llama es INVISIBLE
- **Síntoma, dos veces en dos semanas:** `nucleo/cargas.js` y `web/src/componentes/FichaCriterios.tsx`
  estaban terminados, con sus pruebas, y **no los llamaba nadie**. Grep en todo el repositorio:
  `FichaCriterios` solo se referenciaba a sí mismo.
- **Por qué se cuela:** `npm test` sale verde —las pruebas del módulo pasan— y el inventario de
  tareas lo da por hecho. El módulo *existe*; lo que no existe es su camino hasta el usuario.
- **Regla:** una tarea de construcción no está cerrada hasta que **algo que el usuario ve** lo
  llama. Antes de marcar hecho: `grep -rn "<nombreDelModulo>" web/src exportar nucleo` y comprobar
  que aparece **fuera de sí mismo y de sus pruebas**. Si el único importador es su test, está
  muerto. El gate `anti-codigo-muerto` cubre exportaciones sin uso dentro de un archivo, no módulos
  enteros huérfanos.

### L-42 · Lo que un comité SUPONE entra al cerebro con el mismo rango que lo que verifica

- **Síntoma:** durante ocho días el cerebro dio por hecho un cliente, un contrato de mantenimiento,
  un entregable aceptado por escrito y una línea de proyecto que lo pagara. La pizarra llamaba a esas
  preguntas **«el cuello de botella de TODO»**. No existía ninguna de las cuatro cosas.
- **Causa:** el comité de 29 agentes que fundó el proyecto (`99 §ADR-001`) mezcló en un mismo
  documento **hechos verificados con fuente** (los límites de cada plan gratuito, las cláusulas de
  uso comercial de MapTiler) con **supuestos de contexto que nadie le dio** (que había cliente y
  contrato). Al destilarlo a un ADR, los dos tipos de afirmación quedaron con el mismo aspecto — y a
  partir de ahí son indistinguibles.
- **Por qué ningún gate lo vio:** la estructura era impecable. Las referencias resolvían, el crudo
  estaba archivado, la capacidad cabía. `brain:check` da verde porque el cerebro está bien
  CONSTRUIDO; no puede saber si lo que dice es cierto (`99 §ADR-021`). Sobrevivió además a un consejo
  externo y a una auditoría de cinco lentes: **ninguno cuestionó la premisa, porque los dos la
  heredaron**.
- **Quién lo cazó:** el dueño, leyendo. *«Veo que siempre me hablas de un contrato y en ningún
  momento te he enviado contrato»*. Ocho días, y bastó una frase suya.
- **Regla:** en un crudo de deliberación, un supuesto de CONTEXTO se marca como supuesto y viaja
  marcado al ADR. Y antes de dejar que algo se convierta en «el cuello de botella de todo», hay que
  poder decir **quién lo afirmó y con qué**. Si la respuesta es «lo asumió un comité», no es un
  bloqueo: es una hipótesis con traje de hecho.
- **Lo caro no fue el error, fue la dirección:** ocho días orientando la prioridad hacia un correo
  que no había a quién mandar, mientras el bloqueo real —la ficha estructural de los apoyos— no
  estaba en ninguna lista.

### L-33 · Escribir la prueba y auditar el resultado son dos trabajos distintos
- **Síntoma:** 555 pruebas en verde, escritas con cuidado, ancladas a identidades físicas… y una
  auditoría adversarial de cuatro lentes encontró nueve fallos, cuatro de ellos capaces de meter un
  número falso en un informe firmado. Ninguna prueba estaba mal: **medían lo que yo pensé medir**.
- **Los tres puntos ciegos que se repitieron:** (a) el fixture escondía el caso — los dos tramos
  picaban en el mismo estado, así que tomar el pico del lado equivocado daba igual; (b) el tercer
  estado (`null`) no tenía prueba, solo `true` y `false`; (c) nadie ejercía el módulo SIN su
  configuración.
- **Regla:** tras construir algo con consecuencias, la revisión la hace una lente AJENA con encargo
  de refutar, no el mismo que lo escribió — y sus hallazgos se **reproducen ejecutando** antes de
  aceptarlos (§3.2). Barato de comprobar: si al fixture le cambias un valor y ninguna prueba se pone
  roja, esa prueba no estaba midiendo lo que crees.

### L-43 · Un subagente que tiene que abrir muchas IMÁGENES se cuelga: eso se lee de a poco y en el hilo principal

- **Síntoma:** un workflow de 6 lectores + 1 sintetizador para leer 94 fotografías de estructura.
  **Los 7 agentes murieron.** Cuatro se colgaron sin avanzar (180 s × 6 reintentos cada uno), tres
  cayeron a mitad de respuesta. **3,5 millones de tokens, 1.089 llamadas, tres horas y CERO
  resultados** — el diario no tenía ni una línea recuperable.
- **Causa:** a cada lector le tocaban entre 8 y 20 imágenes. Leer una fotografía es caro y lento, y
  acumuladas en un solo agente lo ahogan. No es un fallo del encargo ni del prompt: es el volumen.
- **La prueba de que el trabajo sí se podía hacer:** las mismas fotos, abiertas de una en una desde
  el hilo principal, se leen sin problema y dan hallazgos reales al primer intento.
- **Regla:** el trabajo con imágenes **no se reparte a subagentes por lotes**. Se hace en el hilo
  principal, de una en una o de dos en dos, entregando resultados a medida — que además es mejor
  para quien espera, porque ve avance en vez de un todo-o-nada de tres horas.
- **Y la regla general que hay detrás:** antes de repartir N unidades de trabajo a subagentes, haz
  UNA tú mismo y mira cuánto cuesta. Si una sola ya es pesada, N en un agente no es N veces más
  lento: es un cuelgue. Emparenta con `L-24` (un agente que muere deja trabajo sin validar).

### L-34 · Un fixture que DECLARA a mano lo que producción DERIVA ensaya otro camino
- **Síntoma:** al unificar las dos políticas opuestas de la deflexión cayeron 10 pruebas: su fixture
  ponía las estructuras en RECTA y declaraba 60° y 120° a mano, así que nunca ejerció la geodesia.
- **Regla:** el fixture aporta el ORIGEN del dato, no el resultado; y una coordenada resuelta se fija
  con sus 17 cifras (a 15, el factor de 60° cruzó de 0,999…9 a 1,000…096 y el apoyo pasó a contarse
  como amplificador: en un criterio con forma `> 1`, el último bit ES el criterio).

### L-39 · Con la familia repartida, una lección nueva se DUPLICA si no buscas el síntoma en los cuatro archivos
- **Síntoma:** el 04-08-2026 se pagó una tarde a *«Missing or insufficient permissions»* al añadir la
  colección `analisis`, y se escribió `L-36` para que no volviera a pasar. La lección **ya existía**:
  `31 · L-22`, escrita días antes por el mismo síntoma, con la misma causa y hasta con el mismo
  remedio de los tres despliegues. No solo se duplicó el texto: **se pagó otra vez un error que ya
  estaba documentado**, que es el fallo de verdad.
- **Causa:** desde que la familia se repartió en madre + tres hijos (`99 §ADR-016`), ningún archivo se
  lee entero. La madre se consulta para ENRUTAR —«¿a qué hijo voy?»— y esa lectura no cruza temas: el
  síntoma era de despliegue, así que se fue derecho a `32` (pantalla) sin mirar `31` (proveedores),
  donde vivía porque la causa es una regla de Firebase. **El reparto por tema esconde lo que tiene un
  síntoma en un tema y la causa en otro.**
- **Regla:** antes de escribir un `L-NN` nuevo, `grep -rn "<síntoma>" docs/3*.md` — literalmente el
  mensaje de error, no el tema. Cuesta cinco segundos. Y si el hallazgo es que ya existía, la lección
  no se borra ni se renumera (la citan el código y otras neuronas): se deja como **puntero** al dueño
  y se anota la recaída, que vale más que la lección original — demuestra que estaba escrita y aun
  así no la leímos.
- **Emparenta con** `L-28` (un módulo que nadie llama es invisible): una lección que el índice no
  lista es exactamente igual de invisible.
