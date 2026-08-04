# 🎨 disenos/ — maquetas de la carcasa, PENDIENTES DE ELECCIÓN

> **No son código de la aplicación.** Son cuatro bocetos HTML autocontenidos que el Ingeniero pidió
> el 2026-08-03 para elegir la carcasa del producto. Se abren con doble clic, sin internet, y son
> navegables con el ratón. Ninguno se ha implementado todavía.

## El encargo, con sus palabras

> «Necesito un entorno muy similar al de mi MacBook M4 Pro, es muy oscuro. También que todo lo que
> hemos consolidado se pueda apreciar al momento de yo seleccionar LN-627, que todo se condense ahí,
> como un sidebar. Recuerda que se irán consolidando más líneas de alta tensión en el proyecto.»

Tres exigencias, y la tercera es la que manda el diseño: **el parque crece**. Once pestañas
horizontales para UNA línea no escalan a veinte.

## Las cuatro tesis de esqueleto

| Archivo | Tesis | Lo que demuestra |
|---|---|---|
| `1-columnas.html` | Tres paneles al estilo Finder/Xcode: parque → secciones → contenido | Con 40 líneas funciona igual que con una; la sección **sobrevive al cambio de línea** |
| `2-tablero.html` | Una pantalla densa por activo; el detalle baja en un inspector lateral | Abres, miras diez segundos y sabes de qué línea ocuparte |
| `3-expediente.html` | La línea como documento, en el orden en que se firma; índice lateral | Lo que se ve en pantalla **es lo que sale por la impresora** (probar con ⌘P) |
| `4-mapa.html` | El trazado manda; los datos van en capas que se encienden | «¿DÓNDE está el problema?» se contesta señalando, no leyendo 24 filas |

Cada archivo trae al final un pie plegable **«Qué propone este diseño»** en español llano.

## La quinta: la piel, no el esqueleto (2026-08-04)

Las cuatro anteriores son **oscuras**. El encargo decía «un entorno muy similar al de mi MacBook,
es muy oscuro» y se leyó como petición de tema oscuro; era una descripción. Al verlas, el Ingeniero
corrigió: **«sigue oscuro, necesito algo más armonioso, como paisajes»**.

| Archivo | Tesis | Lo que demuestra |
|---|---|---|
| `5-horizonte.html` | **Luz y paisaje.** El cielo dice el estado de la línea; el horizonte dibuja los apoyos reales; un apoyo sin veredicto se dibuja **hueco** | En pantalla clara **un dato que falta se ve como un agujero de luz**; en pantalla oscura se confunde con el fondo |

Va montada sobre el esqueleto de `1-columnas`, pero **la piel es independiente del esqueleto**: se
puede llevar a cualquiera de las cuatro. Elegir esqueleto y elegir piel son dos decisiones separadas.

El argumento que la sostiene no es estético sino de control: el riesgo nº 1 del producto es
*certificar sobre un hueco* — el motor puede estar mal y el sistema no fallaría, firmaría. En claro,
el hueco salta a la vista sin que nadie lo señale. Segundo motivo, operativo: bajo el sol del Caribe
una pantalla oscura es un espejo; cuando llegue la captura en campo (F4), el modo claro será el
único legible.

Verificado en esta maqueta, con el DOM y no a ojo:

- ✅ **Coherencia en las 14 líneas**: medidor lateral = torres llenas del horizonte = veredictos de
  la tabla = apoyos con ficha. El aviso dice exactamente los que faltan.
- ✅ **El veredicto existe SOLO donde existe la ficha de inventario**, nunca al revés. Es la regla
  del producto escrita como una sola condición en `apoyosDe()`.
- ✅ LN-627: 24 torres, **las 24 huecas**; 14 vanos de 23 fuera de banda en terracota; E06 marcado
  con su ×1,716.
- ✅ Cero recursos externos · cero coordenadas (auditado con regex de 4+ decimales y de pares
  lat/lon: los únicos decimales largos son diámetros de conductor de catálogo).
- ⚠️ El relieve del horizonte es **sintético**: el orden de los apoyos es real, la cota no. Con las
  cotas reales sería el perfil verdadero de la línea.

## Cómo se hicieron, y qué NO se verificó

Workflow de 7 agentes Opus (`99 §ADR-018` — pendiente de escribir al elegir): 1 de encuadre, 4
diseñadores con tesis enfrentadas y 2 críticos. **Los dos críticos NO llegaron a correr**: se agotó
el límite de la sesión. El 2026-08-04 se relanzó esa deuda como crítica de **4 agentes Opus, uno por
maqueta, más un sintetizador**, juzgando **solo el esqueleto** (el color quedó fuera de alcance: la
piel oscura ya estaba descartada). Su veredicto va al `99 §ADR-018` junto con la elección.

La verificación que sí se hizo a mano sobre las cuatro:

- ✅ **Ni una coordenada real** de LN-627 en ninguna de las cuatro (el repo es público, `33 · L-07`).
- ✅ **Cero recursos externos**: abren sin internet.
- ✅ **El parque escala**: entre 12 y 20 líneas en el sidebar, las cuatro con buscador.
- ✅ **El hueco se pinta como hueco** en las cuatro (13 menciones la que menos —la 1—, 32 la que más).
- ⚠️ **NO verificado**: si de verdad se sienten como macOS. Eso lo dice el ojo del Ingeniero.
- ✅ **FALSA ALARMA, resuelta el 2026-08-04**: los fragmentos `' + '` que se temían en el pie de
  `2-tablero.html` están **dentro del bloque `<script>`** (línea 1844, y otros dos en `1-columnas`),
  y sirven para componer «24 estructuras + 2 empalmes». No se ven en pantalla. Las cuatro limpias.

## Lo que hay que decidir — son DOS decisiones, no una

Desde el 2026-08-04 la elección se parte en dos, y conviene tomarlas por separado:

1. **El esqueleto** — cuál de las cuatro tesis de navegación. El criterio que este proyecto propone
   no es cuál se ve mejor: es **cuál hace más difícil olvidar que 0 de 24 apoyos tienen veredicto**,
   en los dos ejes. Una carcasa que esconda bien ese hueco convierte una herramienta de auditoría en
   una fábrica de falsa confianza. La `4` es la más brutal en eso —enciende la capa «Inventario
   declarado» y la línea se queda hueca—; la `3` es la más honesta con lo que se firma.
2. **La piel** — oscura (1-4) o luminosa (`5-horizonte`). Esta ya la contestó el Ingeniero al pedir
   «algo más armonioso, como paisajes». Queda por confirmar que `5` acierta el tono.

Cualquier combinación es posible: la piel de la `5` se puede montar sobre el esqueleto de la `3` o
de la `4`. Al cerrar ambas → implementar + `ADR-018` + crudo a la bóveda.
