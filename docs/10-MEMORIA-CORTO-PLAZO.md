# 📝 10 — MEMORIA DE CORTO PLAZO (pizarra del trabajo vivo)

> Se **AUTO-CARGA**. Es pizarra, no bitácora: cuando algo cierra del todo, se convierte en ADR en
> `99` y se retira de aquí (§G.3). Tope ~110 líneas / 16k chars.

## 🎯 Foco actual

**F0 · Verificación.** El proyecto nació el 2026-07-28/29. Antes de escribir una línea de aplicación
hay que cerrar tres cosas: el Consejo Externo, la validación del motor de cálculo, y las respuestas
de AFINIA que definen el alcance real.

---

## 🔲 Pendientes del INGENIERO (los que bloquean)

| # | Qué | Por qué bloquea |
|---|---|---|
| **TODO-02** | **Enviar a AFINIA las 7 preguntas restantes** (`99 §ADR-001 · Anexo`; la nº 2 la cerró el Ingeniero en ADR-003) con fecha límite escrita. | La nº 3 (*¿se puede instalar app en sus teléfonos?*) decide si F4 existe. La nº 4 (*¿el contrato permite nube fuera de Colombia?*) decide F5 y F6. La nº 1 (*¿en qué formato reciben y firman el informe?*) define el entregable, que es el único criterio de aceptación que le importa a quien paga. |
| **TODO-03** | **Cronometrar el proceso actual de LN-627** paso a paso (conversación de 20 min). | Sin eso se optimiza un proceso que nadie midió y el ahorro prometido sería inventado. |
| **TODO-04** | **Abrir el HTML en el teléfono de la cuadrilla, en modo avión**, y decir si el mapa se ve o es un lienzo gris. | Confirma en vivo el hallazgo de `30 · L-10`. Un sí/no. |
| **TODO-05** | **Decidir por escrito qué NO se mide de la persona** (tiempos por técnico, rankings, GPS continuo) y decírselo a la cuadrilla. | Sin esto el piloto mide adopción falsa: cooperan el primer día y sabotean el tercero. |
| **TODO-06** | ¿Existen el **GPX crudo del Garmin** y las **fotos originales** en la Mac? | Si existen, el generador lee la fuente. Si no, hay que extraerlas del HTML (ya hay extractor probado). |
| **TODO-18** | **Confirmar o corregir 5 apoyos de LN-627**: E022, E04, E06, E20 y E21 son los únicos con deflexión de anclaje. ¿Son realmente de retención/ángulo? | **Es el bloqueo de F1.** Sin función estructural no hay tramos de tensión, y sin tramos no hay cálculo mecánico. Son 5 respuestas, no 26. |

---

## 🔲 Pendientes de CLAUDE

| # | Qué | Estado |
|---|---|---|
| **TODO-15b** | **Al entrar en F5:** rehacer la comparación de backend (*seguridad declarativa de Firestore* vs *D1 + Workers*) con datos reales de volumen y cuadrillas. Condición disparada por ADR-003. | 🔲 al entrar en F5 |
| **TODO-16** | **Configurar alerta de presupuesto** en el proveedor que se active, ANTES de que reciba tráfico real (guardarraíl de ADR-003). | 🔲 antes de F5 |
| **TODO-13** | **F3:** la capa de datos debe disparar la **invalidación por tramo de tensión** — editar un apoyo recalcula todo su tramo, no solo ese apoyo (ADR-002, enmienda 3). `nucleo/mecanica.js` ya calcula por tramo; falta el disparador. | 🔲 |
| **TODO-14** | **F4:** implementar el **canal de sincronización bifurcado** (datos primero y solos; fotos en cola asíncrona) y el **`base_revision_id` con cuarentena**, nunca rechazo (ADR-002, enmiendas 1 y 2). | 🔲 |
| **TODO-15** | **Si F5 se dispara:** reabrir la comparación *seguridad declarativa de Firestore* vs *D1 + Workers*, con el coste de Blaze sin techo en la balanza. Condición de reapertura anotada en ADR-002. | 🔲 condicional |
| **TODO-09** | ~~Contar campos de ficha llenos~~ → **CERRADO con un resultado inesperado:** el HTML **no guarda ninguna ficha**. Nacen vacías desde `var DEF`, que solo trae **tensión 66 kV** y el **conductor AAAC Darien** (559,5 MCM · 19 hilos · Ø 21,79 mm · 283,5 mm² · 545 A). Todo lo demás —incluida `p_func`— está en blanco. | ✅ |
| **TODO-17** | **F1 bloqueado hasta confirmar 5 apoyos.** Sin `p_func` no hay tramos de tensión y no hay cálculo mecánico. Se propusieron por deflexión (ver abajo); faltan los ojos del Ingeniero. | 🔲 espera TODO-18 |
| **TODO-10** | Leer las 4 funciones de ingeniería restantes: ¿los **2 empalmes** parten vano? ¿contra qué hipótesis se compara el despeje al terreno? | 🔲 |
| **TODO-11** | **F1 · Nota técnica de LN-627**: una página, 5 números, decisión binaria, para que el Ingeniero la firme. | 🔲 tras TODO-08 |
| **TODO-12** | Recalcular el margen real de almacenamiento con la **mezcla de tamaños de línea del parque** (no solo con LN-627, que es una línea chica de 26 apoyos). | 🔲 tras TODO-02 |

---

## ✅ Cerrado en esta sesión (2026-07-28/29)

- **Repositorio creado** y público: https://github.com/PowertransformersMJ/mantenimiento-lineas-at
- **Cerebro y kernel cableados** — kernel íntegro contra el canónico (versión según `brain:check`),
  gates y hooks activos.
- **`nucleo/` portado y verificado** — geodesia, mecánica y térmica como funciones puras.
  **53 pruebas en verde.** Detalle de qué se verificó contra qué → `40 §8`.
- **Comité de Expertos ×3** (29 agentes, 0 fallos, 59 min) → **ADR-001**. Crudo de 477 KB archivado.
- **Consejo Externo corrido e integrado** (Gemini 3.1 Pro vía Antigravity) → **ADR-002**. Confirmó
  ADR-001 en 7 puntos a los que llegó por su cuenta desde el problema crudo, y lo enmendó en 3:
  canal de sincronización bifurcado, OPFS + revisión base con cuarentena, y tres guardarraíles de
  código. Se le **refutaron con evidencia** dos puntos: reusar Firebase (sus Functions no existen en
  plan gratuito, y las 699 líneas de reglas del proyecto hermano son de dominio de transformadores,
  no transferibles) y no guardar los valores calculados (haría irreproducible un informe firmado).
- **Mediciones de F0 ya ejecutadas** (el comité las dejaba pendientes; se hicieron en la misma
  sesión): 99 fotos de trabajo · 17,97 MB · **177 KB de media**; 99 miniaturas · 1,65 MB · **16 KB**
  (9,2 % del original); **14 de 26 apoyos** con foto; 3,8 fotos por apoyo sobre el total.
- **Extractor del módulo de campo probado** sobre el archivo real: 30 MB → 99 JPEG válidos +
  DOCX de 1,49 MB + geometría en JSON.
- **TODO-08 CERRADO — el motor de cálculo ya no tiene deuda.** (a) La ecuación de cambio de estado se
  validó contra la identidad física `ΔL = térmico + elástico` con las longitudes por catenaria (vía
  independiente): error de **0,002 a 0,029 mm sobre 189 m** entre 10 y 90 °C. (b) El **vano peso** se
  derivó de la geometría en vez de pedirse a mano, y **detecta arrancamiento** — condición que el
  módulo original no podía ver. **53 pruebas en verde.**
- **ADR-003:** el Ingeniero fijó alcance (plataforma completa e independiente, no integración con
  Maximo/SAP) y presupuesto (asume el coste si se pasa de los límites gratuitos).

---

## 🚫 Callejones ya probados (no repetir)

- **`node --test tests/`** falla en Node 24: interpreta la carpeta como módulo. Va con patrón
  entrecomillado: `node --test "tests/**/*.test.js"` — y entrecomillado de verdad, porque `sh` no
  expande `**` y dejaría la suite sin correr **sin avisar**.
- **Leer la credencial de GitHub del llavero** para llamar a la API: lo bloquea el clasificador de
  permisos. El camino limpio es `gh auth login` una sola vez (ya hecho).
- **Suponer que el HTML es 100 % offline**: es falso para el mapa (`30 · L-10`).
