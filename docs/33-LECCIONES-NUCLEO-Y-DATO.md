# 🧪 33 — LECCIONES · NÚCLEO Y DATO (el que se firma y el que no sale)

> Hijo de `docs/30-LECCIONES.md`. Mismo formato (`L-NN · título` → **Síntoma** / **Causa** /
> **Regla**) y **los mismos identificadores**: aquí no se renumera nada.
> **Qué guarda:** las dos caras del mismo dato — el que sale firmado hacia el cliente y el que
> jamás debe salir de este repositorio.
> **Se consulta cuando:** *«este número no me cuadra»* · *«voy a tocar `nucleo/`»* · *«¿puedo
> commitear esto?»* · *«¿quién puede bajar estas fotos?»*. Qué lección es cada síntoma lo dice el
> índice de la madre (`30`), su dueño.

---

## El motor que se portó, y el dato que no puede salir

### L-05 · El valor del HTML de 30 MB no es el HTML: son 115 funciones de ingeniería
- **Síntoma:** tentación de tratarlo como prototipo desechable y reescribirlo de cero.
- **Causa:** el 92 % del archivo (27,7 MB) son imágenes en base64 y un DOCX embebido. El código real
  son ~2,4 MB, y dentro de ellos está el criterio de ingeniería acumulado: Vincenty, tramos de
  tensión, VIR, catenaria, cambio de estado, IEEE 738, cargas de viento, validaciones de coherencia.
- **Regla:** el núcleo de cálculo se **porta**, no se reescribe. Vive en `nucleo/` como funciones
  puras sin DOM ni red, y toda migración se valida contra la suite de `tests/`.

### L-06 · El núcleo se extrae sin pérdida — está verificado, no supuesto
- **Causa:** la geodesia reimplementada se comparó contra los 25 vanos que el HTML ya traía
  calculados y contra las constantes WGS84 publicadas. **La tabla completa de qué está verificado y
  qué no vive en `40 §8`, que es su dueño**; aquí solo la consecuencia.
- **Regla:** cualquier cambio en `nucleo/` que ponga `npm test` en rojo es una regresión, no una
  mejora. La prueba de no regresión contra la línea real usa un fixture de la **bóveda privada** (son
  coordenadas de cliente) y se salta sola en CI, avisando.

### L-07 · Los datos de cliente no entran en git, ni en repo privado
- **Causa:** la historia de git es permanente y se propaga a cada clon. Sacar después un archivo que
  no debió entrar obliga a reescribir la historia del repositorio y a que **todas** las copias
  existentes se vuelvan a clonar. Es una operación cara y ruidosa que se evita no cometiendo el error.
  Este repositorio es **público**: el código está a la vista y el dato del cliente no vive aquí.
- **Regla:** coordenadas GPS reales, fotos de campo, informes de cliente y el HTML original **nunca**
  se commitean. Van a `../brain-private/` o a almacenamiento privado. El `.gitignore` los bloquea por
  patrón, pero el `.gitignore` es la segunda línea: la primera es no ponerlos ahí.

### L-23 · Una coordenada real dentro de una PRUEBA es una fuga igual que en el código
- **Síntoma:** `tests/exportar.test.js` afirmaba `filas[1].includes('10.35••••')` — la latitud real
  de una estructura, en un repositorio **público**. Pasó la auditoría de fugas dos veces porque se
  buscaba en `web/src` y en el paquete publicado, no en `tests/`.
- **Recaída (2026-08-01):** al corregirlo, la coordenada se copió **a esta misma lección** y
  sobrevivió porque `docs/` no se grepeaba de verdad.
- **Regla:** en las pruebas el valor esperado se **DERIVA del fixture de la bóveda**
  (`crudo[0].lat.toFixed(6)`), nunca se escribe literal. La auditoría previa al commit cubre
  `tests/`, `herramientas/` y `docs/`:
  `grep -rnE '\b10\.3[45][0-9]{4}\b|\b-?75\.4[89][0-9]{4}\b' .`
  Y si un dato no hace falta para explicar, no se escribe. **Alcance:** la historia de git es
  permanente (`L-07`): se corrige hacia adelante.

---

## El número que se firma: ceros falsos y guardianes

### L-19 · Una regla de dominio se expresa como LISTA CERRADA, y la lista lleva guardián
- **Síntoma (1):** `nucleo/mecanica.js` decidía qué apoyo corta un tramo con una **regex**
  (`/retenci|terminal|ángulo|.../i`) llamada igual que la lista cerrada del contrato. Aceptaba
  cualquier texto que contuviera la sílaba, y tres pruebas de oro usaban `'Retención'` a secas —que
  **no es un valor del contrato**— pasando por casualidad.
- **Síntoma (2), meses después:** `nucleo/longitudinal.js` duplicó esa lista y le faltó
  `'Derivación'`. Un apoyo de derivación publicaba **cero** carga longitudinal en el informe
  firmable, y las 555 pruebas seguían verdes (`99 §ADR-013`).
- **Regla, las dos mitades:** las reglas de dominio son **listas cerradas**, nunca coincidencia de
  texto; y cuando la misma lista debe existir en dos sitios porque `nucleo/` no puede importar
  nada, **la coincidencia la vigila una prueba** que lee el otro archivo y compara. Sin guardián la
  lista diverge, y el día que lo haga nadie se entera. Cazado por revisión adversarial: *reportar
  «hecho» sin verificar contra producción es cómo se cuela esto.*

### L-29 · Para afirmar que algo va en los DOS sentidos, mira el MENOR, no el mayor
- **Síntoma:** la pestaña Cargas anunciaba «5 apoyos tiran hacia LOS DOS lados» y en tres de ellos
  el sentido secundario valía −15, −27 y +28 kgf contra un ruido de tendido de obra de 85 kgf.
  Indistinguible de que la cuadrilla tensara un tramo un pelo distinto.
- **Causa:** la bandera se calculaba comparando el ruido contra el MAYOR de los dos sentidos. Pero
  la afirmación no era «hay carga»: era «hay carga **en ambos**», y esa la sostiene el menor.
- **Regla, general y barata de aplicar:** cuando una conclusión necesita que **varias** cantidades
  superen un umbral, la comprobación va sobre el **mínimo**, nunca sobre el máximo ni sobre la
  suma. Y conviene separar las dos preguntas en dos banderas con nombre distinto
  (`sentidoResoluble` / `inversionResoluble`) en vez de reutilizar una: reutilizarla es justo lo
  que hizo que el error no se viera.

### L-31 · La seguridad que depende de que una variable ESTÉ no es seguridad
- **Síntoma:** el portero de fotos comprobaba la organización con
  `if (ORG_PERMITIDA && sesion.orgId !== ORG_PERMITIDA)`. Con la variable puesta funcionaba; sin
  ella **la comprobación entera se saltaba** y cualquier sesión válida del proyecto —o sea,
  cualquiera con una cuenta de Google, porque el alta es abierta— bajaba fotos de cliente. Nada
  fallaba y nada avisaba.
- **La asimetría que lo delata:** su hermano `PROYECTO_FIREBASE` sí cierra la puerta al faltar,
  porque la comparación lanza. Dos variables igual de críticas, comportamientos opuestos ante la
  misma ausencia. **Si dos comprobaciones del mismo módulo fallan en sentidos distintos, una está
  mal.**
- **Regla:** toda variable de la que dependa una decisión de acceso se valida al ENTRAR, y su
  ausencia APAGA el servicio con un motivo ruidoso (503), nunca lo abre. Un 503 se arregla en un
  minuto; una fuga silenciosa no se descubre hasta que ya pasó.

### L-41 · Un contrato que no se puede EJECUTAR en una prueba solo está revisado por el compilador

- **Síntoma:** 735 pruebas en verde y **ni una sola había validado nunca un esquema Zod**. Lo único
  que miraba los contratos era `tsc`, y `tsc` comprueba TIPOS: no ejecuta el `.refine`, ni el
  `.strict`, ni el `.min(1)`, que son justamente las reglas que impiden que entre basura al
  documento que se firma.
- **Causa:** `node --test` no resuelve imports relativos sin extensión y **no reescribe `.js` a
  `.ts`**. Los contratos importaban entre sí con `.js`, así que cualquier prueba que los tocara
  moría en `ERR_MODULE_NOT_FOUND`. La consecuencia no se veía como un fallo: se veía como que
  «los contratos no se prueban aquí», y así llevaba desde el principio.
- **Arreglo:** extensiones `.ts` explícitas dentro de `contratos/src/` + `allowImportingTsExtensions`.
  Mecánico, y verificable por tres lados a la vez: `tsc` del contrato, `tsc` del web y la
  construcción real. La misma trampa vale para las vistas que se prueban (`docs/20`).
- **Regla:** si una defensa vive en un esquema, tiene que poder ejecutarse en una prueba. Si no se
  puede, no es una defensa verificada — es una intención bien escrita. Y comprobar que sigue
  funcionando exige **mutarla**: quitar el `.strict()` y ver la prueba roja.
- **El riesgo del lado contrario, que casi se paga:** endurecer el camino de guardado pudo dejar
  fuera una clave que la pantalla sí manda, y romperle el guardar a alguien que estaba trabajando.
  Se comprobó a mano y estaba bien; a mano no sirve la próxima vez, así que las formas exactas que
  envía cada editor quedaron fijadas en la prueba.

### L-53 · Una marca que se dispara con una forma de dato que el sistema no escribe es peor que no tenerla

- **Síntoma:** `exportar/informe.js` tenía escrita, con todas sus palabras, la marca que distingue un
  veredicto calculado sobre un dato estimado a ojo de uno calculado sobre una medida — y **una prueba
  en verde que juraba que funcionaba**. En producción no marcó nunca nada: los 24 apoyos habrían
  salido idénticos en el papel firmado.
- **Causa:** TRES desajustes a la vez, y ninguno da error. ① Leía `fila.procedencias`, y los sellos
  viven en el **apoyo**, no en la fila que el núcleo publica. ② Buscaba `{origen: 'estimado'}` cuando
  el contrato escribe `{procedencia: 'supuesto', fuente, declaradoEn, declaradoPor}`. ③ La prueba
  fabricaba la fila **a mano**, con esa misma forma inventada, así que ensayaba un camino que la
  aplicación no recorre. En JavaScript leer una clave que no existe no falla: devuelve `undefined`, la
  marca sale vacía, y el informe se imprime impecable.
- **Regla:** una prueba de una marca **recorre el camino real** — el documento se valida contra el
  molde (`Apoyo.safeParse`) y las filas las produce la misma vista que usa la aplicación. Si el
  fixture se escribe a mano, lo que se prueba es la imaginación de quien lo escribió. Emparenta con
  `30 · L-34` (un fixture más completo que la realidad prueba el camino cómodo) y con `30 · L-33`
  (verde no prueba nada).
- **Y la regla de diseño que lo cierra:** quien decide qué está supuesto es **el motor**, no el
  papel. Es el único que sabe qué campos entraron en cada eje — el transversal come la carga de
  rotura y las dos alturas; el longitudinal, la capacidad longitudinal, la altura de amarre y cuántas
  fases amarran. Una marca deducida en el exporte a partir de los sellos del apoyo señalaría en un eje
  un dato que solo entró en el otro: **una alarma que salta cuando no debe se acaba ignorando**, y con
  ella las de verdad.

### L-59 · Un atajo que llena UN campo de tres no mueve el veredicto: mídelo antes de venderlo

- **Síntoma:** la pantalla del lote (`99 §ADR-038`) se construyó para desatascar el cuello de botella
  de la ficha —**0 de 25 apoyos con veredicto**— aplicando el dato de catálogo a los 25 de un gesto.
  Con la carga de rotura declarada y los 25 marcados, el panel del propio motor respondió: *«Ningún
  apoyo gana veredicto con esto. De 25 apoyos del tramo, 25 siguen sin veredicto»*.
- **Causa:** el veredicto transversal come **tres** datos —carga de rotura, altura libre y altura del
  amarre— y el lote solo puede traer el primero. Los otros dos dependen del terreno y de qué hace ese
  apoyo, así que **no van por lote nunca** (regla dura del contrato, `ADR-030`). El atajo es real y
  ahorra trabajo de verdad; lo que no hace es producir el resultado que uno espera del trabajo.
- **Regla:** antes de anunciar que una herramienta «desbloquea» algo, **córrela contra el dato real y
  lee lo que dice el motor**, no lo que dice la intención. Aquí el propio antes/después lo dijo ANTES
  de escribir una sola fila —que es exactamente para lo que se construyó (`ADR-030`)— y evitó
  prometerle al Ingeniero veredictos que la medición de campo sigue debiendo. Un tablero que enseña
  qué NO se mueve vale tanto como el que enseña qué se mueve.
- **Y la consecuencia de negocio, que es la que importa:** el trabajo pendiente de la ficha no es un
  tercio menos por tener lote. Es **el mismo trabajo de campo** con la parte de escritorio resuelta.
  Emparenta con `30 · L-51` («hecho» es lo que se VE) y con `TODO-57`/`TODO-59`.

### L-40 · Si el núcleo solo publica la PROSA de un hueco, quien la lea deducirá el hecho — y mal

- **Síntoma:** el informe imprimía *«Ningún apoyo declara su capacidad, así que ninguna fila lleva
  veredicto»*. Con el inventario vacío del todo era cierto por casualidad. En cuanto un apoyo declare
  su carga de rotura y le falte la altura libre, esa frase es **falsa en un papel firmado**.
- **Causa:** el núcleo SÍ sabía qué faltaba en cada apoyo, pero lo publicaba únicamente dentro de una
  frase (`avisoDeCapacidad`). El único dato contable a mano era «¿tiene veredicto?», así que el
  informe contó eso y afirmó lo otro. No fue descuido de quien escribió el informe: **no tenía de
  dónde sacar el hecho**.
- **Regla:** todo hecho que alguien vaya a CONTAR se publica como dato —booleano o lista—, además de
  redactarlo. La prosa es para imprimir; el dato es para contar. Si solo hay prosa, el consumidor
  acabará infiriendo el hecho de su vecino más cercano, y el vecino no dice lo mismo.
- **Y la parte incómoda:** había una prueba sobre esa frase, y **fijaba la deducción falsa** —
  construía el caso poniendo `utilizacion_pct: null` sin tocar la capacidad y luego exigía el texto.
  Una prueba que ensaya el error lo blinda: pasa a ser el guardián de la falta. Emparenta con
  `30 · L-33` (escribir la prueba y auditar el resultado son dos trabajos distintos) y con
  `99 §ADR-017`, que es la misma familia: **contar una cosa y decir que cuentas otra**.

### L-32 · Un guardián que cuenta INTENTOS no cuenta nada
- **Síntoma:** `if (!porEstado.length) return no_evaluable` parecía blindar la fila. Pero
  `porEstado` recoge un objeto por cada estado PROCESADO, y esos objetos pueden traer
  `flPorConductor_kgf: null`. Con el ángulo sin resolver, el array tenía cuatro entradas y ninguna
  cifra: el guardián no disparaba, y aguas abajo `Math.max(null ?? 0, null ?? 0)` convertía el hueco
  en un cero que se publicó **en prosa** dentro del informe firmable.
- **Regla:** el guardián se pone sobre el RESULTADO que se va a publicar, no sobre la colección
  intermedia. Y el patrón `x ?? 0` merece sospecha permanente en este proyecto: es la forma más
  corta de convertir «no se sabe» en «vale cero».

### L-45 · Una regla que el motor CALCULA y nadie consume no es una regla: es un comentario
- **Síntoma:** el método declara desde el primer día que «una cadena que termina en el mecanismo
  físico NO es causa raíz». Estaba escrito en el contrato, explicado en `diagnosticoCadena`,
  **calculado** en `validarArbol` (`hojasNoAccionables`) y **probado** (`tests/rca.test.js:212`).
  Y no lo aplicaba nadie: el desplegable de declarar ofrecía el árbol entero, así que se podía
  firmar «el conector se corroyó» como causa raíz, y el informe calculaba el aviso y no lo imprimía.
  La regla de oro del segmento se podía violar **desde su propia pantalla**.
- **Por qué se cuela, y por qué `L-28` NO lo cubre:** allí el módulo entero era huérfano y su
  remedio es `grep` del nombre. Aquí `validarArbol` **sí** se llama —desde la pantalla y desde el
  informe—, así que ese grep da **luz verde**. Lo que se caía al suelo era **un campo de la
  respuesta**: `const v = validarArbol(arbol)` seguido de usar solo `v.problemas`. Verde en las
  pruebas (el cálculo es correcto), verde en el grep (el módulo se llama), y la regla sin efecto.
- **Regla:** cuando el núcleo devuelve un objeto con varios campos, **cada campo tiene que tener un
  consumidor o no debe existir**. Antes de cerrar: `grep -rn "<campo>" web/src exportar` y comprobar
  que aparece fuera del núcleo y de sus pruebas. Y el sitio donde comprobarlo es el **punto de
  decisión** —el formulario que firma, no la tabla que informa—: un cálculo que solo se pinta en una
  tabla no impide nada. Emparenta con `30 · L-28` (módulo huérfano) y con `L-32`: las tres son la
  misma familia — **el motor sabe y el humano no se entera**.
- **Cómo se probó que ahora sí protege:** por MUTACIÓN. Al retirar el tope de nivel, 3 pruebas se
  ponen rojas (`99 §ADR-020` usa la misma técnica con el tope climático). Verde sin mutante no
  demuestra que la regla haga algo.

### L-46 · Un MÁXIMO DE VENTANA DESLIZANTE no es una medida de régimen
- **Síntoma:** al leer la oscilografía COMTRADE de LN-627 se publicaron como «corriente de falla»
  los máximos de una ventana RMS deslizante: **13.965 A** en la fase fallada y **475 A** en la fase
  A. Ambos entraron al expediente y a una presentación de gerencia. Medidos sobre **ciclos completos
  que no cruzan la transición**, los valores reales son **13.700 A** y **379 A** — y el segundo va en
  el sentido CONTRARIO: la fase A no sube, **baja**.
- **Por qué engaña:** la ventana deslizante busca el máximo en todo el registro, así que se coloca a
  caballo entre el régimen de carga y el de falla y promedia dos estados que no coexisten. El número
  sale plausible, del orden correcto, y por eso nadie lo cuestiona. Lo cazó el Ingeniero preguntando
  si una cifra concreta era correcta.
- **Regla:** una corriente de falla se mide sobre **ciclos enteros dentro de un solo régimen**, y se
  declara la ventana usada. Nunca el máximo global de un registro que contiene la transición.
- **La comprobación que valida la escala, y es barata:** en un registro trifásico con canal residual,
  **IA + IB + IC debe igualar IN**. Aquí cerró con **0,1 %**, lo que confirma de una vez que los
  factores de escala de los cuatro canales son correctos. Hazla siempre antes de publicar cifras.
- **Lo que apareció por mirar bien:** la corriente a tierra **ya venía subiendo antes del disparo**,
  de 28 A a 195 A en el medio segundo previo y de forma monótona. Ese dato —que el máximo deslizante
  escondía— es el que sostiene la degradación progresiva frente a cualquier causa externa súbita.
  Emparenta con `L-32`: el guardián va sobre el resultado que se publica, no sobre el intermedio.

### L-50 · Un archivo que se DECLARA sintético es donde mejor se esconde un dato real

- **Síntoma:** `tests/sembrar-mapeo.test.js` abría con una cabecera explícita —*«EL MUNDO DE ESTA
  PRUEBA ES SINTÉTICO… Las coordenadas son inventadas (lat/lon en torno a 1, que no es ningún sitio
  de esta línea)»*— y era verdad: las coordenadas estaban inventadas. Pero dos campos `utc` llevaban
  **las horas exactas de captura de los waypoints reales**, copiadas byte a byte de los GPX de la
  bóveda, junto a los códigos de waypoint de las dos subestaciones del cliente. Nada en el archivo
  desentonaba: el gate de coordenadas de `docs/10` busca `10.xxxx` y `-75.xxxx` y no mira una fecha.
  Lo cazó un auditor adversarial comparando el archivo con la bóveda, con 1.014 pruebas en verde.
- **Causa:** la cabecera hace el trabajo de la sospecha. Quien escribe se acuerda de inventar
  **aquello de lo que la regla habla** —la coordenada, que es lo que todos citan— y arrastra lo demás
  del fixture que tiene delante, porque «total, es una prueba». Y quien revisa lee la promesa del
  encabezado y da por sintético el archivo entero. Es `L-23` un piso más arriba: allí la fuga era una
  coordenada dentro de una prueba; aquí es una fuga **dentro de un archivo que ya declaraba no
  tenerla**.
- **Regla:** en un archivo declarado sintético, **todo campo copiado es sospechoso, no solo la
  coordenada**. Una hora de captura dice cuándo estuvo la cuadrilla en el sitio; un código de
  waypoint puede descifrar el nombre de la instalación. La comprobación no es leer la cabecera: es
  **buscar cada valor literal en la bóveda** (`grep` del valor exacto sobre `fixtures/`) — si aparece,
  es real, lo diga quien lo diga. Y se hace **antes del commit**: la historia de git es permanente
  (`L-07`), así que un `git commit` es el punto de no retorno, no el `git push`.
- **Emparenta con** `L-23` (la coordenada en la prueba), `L-07` (la historia de git no se borra) y
  `30 · L-33` (escribir la prueba y auditarla son dos trabajos distintos). Cazado y cerrado el
  16-08-2026 antes del primer commit, en `99 §ADR-027`.
