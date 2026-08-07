# 🧪 33 — LECCIONES · NÚCLEO Y DATO (el que se firma y el que no sale)

> Hijo de `docs/30-LECCIONES.md`. Misma memoria procedimental, mismo formato
> (`L-NN · título` → **Síntoma** / **Causa** / **Regla**) y **los mismos identificadores**: aquí no
> se renumera nada, solo cambia el archivo donde vive la definición.
> **Qué guarda:** las dos caras del mismo dato — el que sale firmado hacia el cliente (cálculo
> portado, reglas de dominio, guardianes de valor) y el que jamás debe salir de este repositorio.
> **Se consulta cuando:** *«este número del informe firmable no me cuadra»* — un apoyo de derivación
> publicó CERO carga longitudinal con las 555 pruebas en verde (`L-19`), un guardián contaba
> intentos en vez de resultados y publicó otro cero falso (`L-32`), la pantalla afirmó «5 apoyos
> tiran hacia los dos lados» y tres eran ruido de tendido (`L-29`); *«voy a tocar `nucleo/` o sus
> pruebas de oro»* (`L-05` se porta, no se reescribe; `L-06` está verificado, no supuesto); y su
> gemelo de riesgo, el dato que no puede salir: *«¿puedo commitear este archivo?»* (`L-07` en el
> código, `L-23` dentro de una prueba o de la propia documentación), *«¿quién puede bajar estas
> fotos?»* (`L-31`: el portero se saltaba entero si faltaba una variable, y nada avisaba).

---

## El motor que se portó, y el dato que no puede salir

### L-05 · El valor del HTML de 30 MB no es el HTML: son 115 funciones de ingeniería
- **Síntoma:** tentación de tratar el archivo como un prototipo desechable y reescribirlo de cero.
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
