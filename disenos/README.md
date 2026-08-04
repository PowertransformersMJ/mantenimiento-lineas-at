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

## Las cuatro tesis

| Archivo | Tesis | Lo que demuestra |
|---|---|---|
| `1-columnas.html` | Tres paneles al estilo Finder/Xcode: parque → secciones → contenido | Con 40 líneas funciona igual que con una; la sección **sobrevive al cambio de línea** |
| `2-tablero.html` | Una pantalla densa por activo; el detalle baja en un inspector lateral | Abres, miras diez segundos y sabes de qué línea ocuparte |
| `3-expediente.html` | La línea como documento, en el orden en que se firma; índice lateral | Lo que se ve en pantalla **es lo que sale por la impresora** (probar con ⌘P) |
| `4-mapa.html` | El trazado manda; los datos van en capas que se encienden | «¿DÓNDE está el problema?» se contesta señalando, no leyendo 24 filas |

Cada archivo trae al final un pie plegable **«Qué propone este diseño»** en español llano.

## Cómo se hicieron, y qué NO se verificó

Workflow de 7 agentes Opus (`99 §ADR-018` — pendiente de escribir al elegir): 1 de encuadre, 4
diseñadores con tesis enfrentadas y 2 críticos. **Los dos críticos NO llegaron a correr**: se agotó
el límite de la sesión. La verificación que sí se hizo, a mano:

- ✅ **Ni una coordenada real** de LN-627 en ninguna de las cuatro (el repo es público, `33 · L-07`).
- ✅ **Cero recursos externos**: abren sin internet.
- ✅ **El parque escala**: entre 12 y 20 líneas en el sidebar, las cuatro con buscador.
- ✅ **El hueco se pinta como hueco** en las cuatro (13 menciones la que menos —la 1—, 32 la que más).
- ⚠️ **NO verificado**: si de verdad se sienten como macOS. Eso lo dice el ojo del Ingeniero.
- ⚠️ `2-tablero.html` puede traer restos de código en el pie explicativo (se vieron fragmentos
  `' + '` al extraer el texto del archivo). Comprobar al abrirla; si sale así, es de montaje.

## Lo que hay que decidir

**Cuál de las cuatro.** Y el criterio que este proyecto propone para elegir no es cuál se ve mejor:
es **cuál hace más difícil olvidar que 0 de 24 apoyos tienen veredicto**, en los dos ejes. Una
carcasa que esconda bien ese hueco convierte una herramienta de auditoría en una fábrica de falsa
confianza. La `4` es la más brutal en eso —enciende la capa «Inventario declarado» y la línea se
queda hueca—; la `3` es la más honesta con lo que se firma.
