# ⚡ 40 — LÓBULO DE DOMINIO: Líneas de Alta Tensión

> **Nodo de dominio.** NO se auto-carga. Léelo antes de tocar cualquier cálculo, ficha de apoyo o
> criterio de evaluación. Aquí vive el conocimiento de ingeniería del proyecto: qué significa cada
> magnitud, de dónde sale cada fórmula y qué está verificado contra qué.
>
> **Regla madre del dominio (portada de `powertransformersmj.github.io` §3.2):** el veredicto sale
> SIEMPRE del VALOR contra la NORMA, **nunca** del texto de un modelo de lenguaje. Si un número no
> tiene fórmula o norma detrás, no es un veredicto: es una opinión.

---

## §1 — La topología: de qué está hecha una línea

Una línea de alta tensión no es una lista de postes. Es una cadena con jerarquía, y confundir los
niveles es la fuente número uno de errores de cálculo.

```
LÍNEA  (p.ej. LN-627)
 └── TRAMO DE TENSIÓN  ── entre dos anclajes; es la unidad REAL del cálculo mecánico
      └── VANO  ── distancia entre dos apoyos consecutivos
           └── APOYO  ── la estructura física (poste/torre), con su ficha
```

- **Apoyo**: la estructura. Tiene GPS, altura, material, función estructural, crucetas, retenidas,
  aislamiento y puesta a tierra.
- **Vano** (`a`): distancia horizontal entre dos apoyos consecutivos, en metros.
- **Tramo de tensión**: el conjunto de vanos entre dos **anclajes**. Dentro de un tramo el conductor
  se mueve libremente sobre las poleas/suspensiones, así que **la tensión mecánica es común a todo el
  tramo**. Por eso el cálculo mecánico NO se hace vano a vano: se hace por tramo.
- **Anclaje**: un apoyo que corta el tramo. En el código son los de función `Retención`, `Terminal`,
  `Ángulo` o `Derivación`, más los extremos de la línea.

### Vanos característicos (los tres que se confunden entre sí)

| Vano | Qué es | Para qué sirve |
|---|---|---|
| **Vano real** (`a`) | distancia entre apoyo *i* e *i+1* | geometría, flecha de ese vano |
| **Vano viento** | semisuma de los dos vanos adyacentes | carga **transversal** de viento sobre el apoyo |
| **Vano peso** | distancia entre los puntos más bajos de las catenarias adyacentes | carga **vertical** sobre el apoyo |
| **Vano ideal de regulación (VIR)** | `√( Σaᵢ³ / Σaᵢ )` sobre el tramo | el vano único **equivalente** con el que se tensa todo el tramo |

> El **VIR** es la pieza que hace que el cálculo por tramo funcione: se calcula un solo estado
> mecánico con el VIR y ese resultado gobierna todos los vanos del tramo.

**Dato real verificado de LN-627:** **24 estructuras** (más 2 empalmes, que NO son apoyos — ver §10)
· **23 vanos** · 2,929 km · vano medio 127,35 m (mínimo 13,35 m — el par de retención E20–E21 —
máximo 336,70 m) · **VIR = 198,20 m**.

---

## §2 — Geometría: distancias y azimuts

Las coordenadas vienen de GPS (Garmin GPSMAP 65, **WGS84**). Las distancias se calculan con la
**fórmula inversa de Vincenty** sobre el elipsoide WGS84 (a = 6 378 137 m, f = 1/298,257223563), no
con la fórmula del haversine: en vanos de cientos de metros el haversine introduce error sistemático
porque asume esfera.

- Devuelve **distancia geodésica** y **azimut inicial** (0–360°).
- Converge por iteración de λ con tolerancia 1e-12 y tope de 200 iteraciones.
- La **deflexión** en un apoyo es el cambio de azimut entre el vano entrante y el saliente. Es lo que
  decide si un apoyo puede ser de suspensión o está obligado a ser de retención.

> ⚠️ **Sistema de referencia.** El levantamiento está en WGS84. El sistema oficial de Colombia es
> **MAGNA-SIRGAS**. Para distancias y flechas la diferencia es despreciable, pero **para cruzar con
> cartografía oficial o catastral hay que transformar**. Está pendiente decidir si el sistema
> almacena WGS84 y transforma al vuelo, o almacena ambos. → `docs/99-HISTORIAL-ADR.md`.

---

## §3 — Mecánica del conductor

### 3.1 Catenaria y parábola

El conductor colgado adopta una **catenaria**. La **parábola** es su aproximación de primer orden.

- Parámetro de la catenaria: `C = H / w` (H = tiro horizontal en kgf, w = masa lineal en kg/m)
- Flecha catenaria: `f = C · (cosh(a / 2C) − 1)`
- Longitud catenaria: `L = 2C · sinh(a / 2C)`
- Flecha parábola: `f = w·a² / (8H)`
- Longitud parábola: `L = a + 8f² / (3a)`

**Verificado en el vano más desfavorable de LN-627** (336,70 m, AAAC, EDS 20 % RTS = 3 524 kgf):
parábola 6,173 m vs catenaria 6,176 m → **diferencia 0,04 %**. A estos vanos la parábola es
perfectamente utilizable; la catenaria se reserva para vanos largos o cuando se audita el resultado.

### 3.2 Ecuación de cambio de estado

Es el corazón del cálculo mecánico: dado un estado conocido (H₁, w₁, t₁) predice el tiro H₂ en otro
estado (w₂, t₂). Forma parabólica:

```
H₂² · (H₂ + A) = B
  A = −H₁ + α·E·S·(t₂ − t₁) + (w₁²·a²·E·S) / (24·H₁²)
  B = (w₂²·a²·E·S) / 24
```

donde `a` = **VIR del tramo**, `S` = sección (mm²), `E` = módulo elástico (kg/mm²), `α` = coeficiente
de dilatación (1/°C). Se resuelve numéricamente por **bisección** (200 iteraciones, con expansión
previa del extremo superior hasta acotar la raíz). No tiene solución cerrada útil: es una cúbica.

**Los cuatro estados que se evalúan siempre:**

| Estado | Condición | Qué vigila |
|---|---|---|
| **EDS** | temperatura de cada día, sin viento | tensión de servicio permanente (fatiga, vibración) |
| **Máxima temperatura** | `t_max` del conductor, sin viento | **flecha máxima** → distancia mínima al terreno |
| **Máximo viento** | viento de diseño, temperatura coincidente | **tiro máximo** → carga sobre estructuras y herrajes |
| **Mínima temperatura** | mínima, sin viento | tiro máximo en frío, esfuerzos en retenciones |

> **EDS** (*Every Day Stress*) se expresa como % de la carga de rotura (RTS). Un EDS alto ahorra
> altura de apoyo pero acorta la vida del conductor por vibración eólica.

### 3.3 Carga de viento

```
q = ½ · ρ · v²        (presión dinámica; v en m/s, ρ en kg/m³)
w_viento = q · Cx · d / g     (carga transversal por metro de conductor)
```

`d` = diámetro del conductor (m), `Cx` = coeficiente de arrastre (≈ 1,0 para cilindro). La carga
resultante que entra en el cambio de estado es la **composición vectorial**:
`w_total = √(w_propio² + w_viento²)`.

### 3.4 Límites admisibles

- Tensión mecánica máxima admisible: **50 % de la RTS**.
- Los estados de viento y de mínima temperatura no deben superarlo.
- La flecha a máxima temperatura debe respetar la **distancia mínima al terreno** (parámetro
  `tmin_terr`), que en Colombia fija el **RETIE** según tensión y tipo de zona.

---

## §4 — Comportamiento térmico y eléctrico

### 4.1 Resistencia

```
R₂₀ = 1,7241e−8 / conductividad / (S · 1e−6) · 1,02      [Ω/m]
R(T) = R₂₀ · (1 + β · (T − 20))
```

El factor **1,02** es el sobrelargo por cableado (los hilos van helicoidales, recorren más que la
longitud del cable). Verificado contra tabla de fabricante para **Darien AAAC 283,4 mm²**:
calculado **0,1182 Ω/km** vs tabla ≈ **0,1198 Ω/km** → desviación **1,3 %**, aceptable.

| Material | Conductividad (p.u. cobre) | β (1/°C) | T máx. continua |
|---|---|---|---|
| ACSR | 0,610 | 0,00403 | 75 °C |
| AAAC | 0,525 | 0,00347 | 90 °C |
| ACAR | 0,570 | 0,00380 | 90 °C |
| ACSS / ACCC | 0,610 | 0,00403 | 200 °C |

> El límite de 90 °C del **AAAC** viene de la aleación **6201-T81**: por encima pierde propiedades
> mecánicas de forma permanente. No es un valor conservador de catálogo, es un umbral de material.

### 4.2 Ampacidad — IEEE Std 738, régimen permanente

Balance térmico: lo que el conductor genera por efecto Joule iguala lo que pierde por convección y
radiación, menos lo que gana del sol.

```
I = √( (q_c + q_r − q_s) / R(Tc) )
```

- **q_c** — convección. Se toma **el mayor** de tres correlaciones: viento bajo, viento alto y
  convección natural. Depende de Reynolds, que depende de densidad y viscosidad del aire a la
  temperatura de película `Tf = (Tc + Ta)/2`, corregidas por **altitud**.
- **q_r** — radiación: `17,8 · D · ε · [((Tc+273)/100)⁴ − ((Ta+273)/100)⁴]`
- **q_s** — ganancia solar: `α · Qs · D`

**Verificado — Darien AAAC 283,4 mm², Ø 21,79 mm** (Ta = 32 °C, v = 0,61 m/s, Qs = 1000 W/m²,
ε = α = 0,5, 10 msnm):

| Tc | Ampacidad |
|---|---|
| 75 °C | 611 A |
| 80 °C | 649 A |
| **90 °C** | **718 A** |
| 100 °C | 779 A |

**Sensibilidades que explican por qué el derrateo importa en el Caribe:**

| Viento (Tc 90 °C) | | Ambiente (Tc 90 °C) | |
|---|---|---|---|
| 0 m/s (calma) | **522 A** | 25 °C | 763 A |
| 0,61 m/s | 718 A | 32 °C | 718 A |
| 1,0 m/s | 807 A | 38 °C | 676 A |
| 2,0 m/s | 965 A | 42 °C | 646 A |

> Lectura operativa: **un día sin viento le quita al conductor el 27 % de su capacidad**. El viento
> pesa más que la temperatura ambiente. Por eso la ampacidad de placa es engañosa y el sistema debe
> calcularla contra condiciones reales, no citar el catálogo.

---

## §5 — Aislamiento

- **Distancia de fuga total** = nº de unidades de la cadena × fuga por unidad (mm).
- **Fuga específica** = fuga total / tensión máxima Um (mm/kV). Es el indicador que se compara contra
  el **nivel de contaminación** del sitio (IEC 60815). En zona costera del Caribe —salinidad— el
  nivel exigido es alto, y una cadena dimensionada para zona limpia falla por contorneo.
- El HTML original ya emite alerta cuando `fuga_específica < exigida por el nivel declarado`.

---

## §6 — La ficha del apoyo (~48 campos)

Agrupada por bloques, tal como se levantó en campo:

| Bloque | Campos |
|---|---|
| **Sistema** | `tension`, `um`, `bil`, `fases`, `circuitos`, `neutro`, `tipo_red` |
| **Conductor** | `c_mat`, `c_cod`, `c_cal`, `c_form`, `c_diam`, `c_secc`, `c_amp`, `c_tmax` |
| **Cable de guarda** | `g_tipo`, `g_diam`, `g_ang` (ángulo de apantallamiento) |
| **Aislamiento** | `a_mod`, `a_mat`, `a_n`, `a_fuga`, `a_contam` → derivados: fuga total, fuga específica |
| **Apoyo** | `p_tipo`, `p_alt`, `p_res`, `p_conf`, `p_func` |
| **Crucetas / retenidas** | `cr_mat`, `cr_long`, `cr_cant`, `ret_cant`, `ret_tipo` |
| **Cargas** | `vano_peso` → derivado: vano viento |
| **Puesta a tierra** | `pat_tipo`, `pat_n`, `pat_ohm` |
| **Condición** | `condicion`, `inclin`, `corros`, `veget` |
| **Inventario** | `anio`, `cod_inv`, `propietario` |

> `p_func` (función estructural) es el campo más cargado de consecuencias: **decide dónde se corta el
> tramo de tensión** y, por tanto, todo el cálculo mecánico. Cambiarlo recalcula la línea entera.

---

## §7 — Catálogos de referencia

**Conductores** (masa lineal kg/m · carga de rotura kgf): Raven, Quail, Pigeon, Penguin, Partridge,
Linnet, Hawk, Dove, Grosbeak, Drake · AAAC 559,3 mm² · Alliance, Butte, Canton, Cairo, **Darien**,
Elgin, Flint · ACAR 300/500/750 · ACSS Hawk · ACCC Linnet.

**Propiedades mecánicas** (módulo elástico kg/mm² · dilatación 1/°C): ACSR 7700 / 18,9e−6 ·
AAAC 6300 / 23,0e−6 · ACAR 6500 / 21,5e−6 · ACSS-ACCC 6000 / 19,5e−6.

> ⚠️ Son valores **referenciales**. Ante un cálculo que se entrega a cliente, se confirman contra la
> hoja del fabricante del conductor realmente instalado. El sistema debe permitir sobrescribirlos por
> línea y dejar registro de la fuente.

---

## §8 — Estado de verificación de este lóbulo

| Qué | Cómo se verificó | Resultado |
|---|---|---|
| Vincenty | reimplementado y comparado contra los 25 vanos ya calculados en el HTML | desviación máx. **4,5e−6 m** y **3,6e−9°** |
| Catenaria vs parábola | vano de 336,70 m con EDS 20 % RTS | diferencia **0,04 %** |
| Resistencia c.c. | Darien AAAC contra tabla de fabricante | **1,3 %** de desviación |
| Ampacidad IEEE 738 | monotonía y sensibilidades físicas | coherente (718 A a 90 °C) |
| **Cambio de estado** | identidad física `L₂−L₁ = ΔL_térmico + ΔL_elástico`, con las longitudes por **catenaria** — vía independiente de la ecuación parabólica que usa el solver | ✅ error **0,002 a 0,029 mm** sobre 189 m de cable, de 10 a 90 °C (≈1,5·10⁻⁷ relativo) |
| **Vano peso** | derivado de la geometría de las catenarias adyacentes + coherencia física en 6 escenarios de relieve | ✅ y **mejora al original**: detecta arrancamiento, que el HTML no podía ver |

> **Cómo se validó el cambio de estado sin caer en circularidad.** La ecuación nace de una identidad:
> al pasar de un estado a otro, el cable cambia de longitud exactamente lo que se dilata por
> temperatura más lo que se estira por carga. El solver resuelve la forma parabólica; la verificación
> recalcula ambos lados de esa identidad **por la vía de la catenaria**, que no usa la ecuación en
> ningún punto. Que las dos vías coincidan en centésimas de milímetro sobre 189 metros de conductor
> es una comprobación independiente, no una tautología. El residuo crece con la temperatura
> (0,029 mm a 90 °C) porque ahí la parábola se separa algo más de la catenaria: es la aproximación
> asomando, y está tres órdenes de magnitud por debajo de cualquier tolerancia de campo.

### §8.1 — Vano peso: lo que aquí se hace mejor que en el módulo original

El HTML pedía el vano peso **escrito a mano** en la ficha. Eso tiene una consecuencia grave: si nadie
lo calcula bien, **la condición de arrancamiento no se detecta nunca**.

```
vano_peso = (a₁ + a₂)/2 + (H/w) · (h₁/a₁ − h₂/a₂)
```

con `h₁ = z_apoyo − z_anterior` y `h₂ = z_siguiente − z_apoyo`, medidos entre **puntos de sujeción**
del conductor (cota del terreno más altura útil del apoyo), no entre cotas de terreno.

| Situación | Efecto | Verificado |
|---|---|---|
| Terreno plano | vano peso **=** vano viento | ✅ exacto |
| Cima de loma (±15 m) | el apoyo carga **2,8×** más | ✅ |
| Vaguada suave (−8 m) | el vano peso se desploma a casi cero | ✅ |
| **Vaguada pronunciada (−25 m)** | **vano peso NEGATIVO → ARRANCAMIENTO** | ✅ se marca solo |
| Ladera de pendiente constante | apenas se aparta del vano viento | ✅ |

> **Arrancamiento** significa que el conductor tira hacia **arriba** del apoyo. Exige herrajes
> antiarrancamiento y cambia el criterio de diseño de la estructura. Un apoyo en el fondo de una
> vaguada entre dos lomas es el caso típico, y en el Caribe hay relieve suficiente para que ocurra.
>
> ⚠️ **Requisito de dato:** para que esto sea fiable hacen falta las cotas de los **puntos de
> sujeción**. El levantamiento GPS da la cota del **terreno** donde se paró el operario. Mientras la
> ficha no traiga altura útil del apoyo, el resultado es indicativo y debe declararse como tal.

**Advertencia que enmarca toda esta tabla** (la cazó el peer review anónimo del comité, `99 §ADR-001`):
las pruebas comprueban que el sistema nuevo **reproduce** al módulo original, no que el original
estuviera bien. Por eso las tres primeras filas se validan contra **referencias externas** —constantes
geodésicas publicadas y tabla de fabricante—, no contra el propio HTML. Las dos pendientes siguen
sin referencia externa, y **quien firma es el Ingeniero, no el software**.

---

## §8.2 — La estructura real de LN-627, derivada de la geometría

El módulo de campo **no guarda ninguna ficha**: nacen vacías, con solo la tensión (66 kV) y el
conductor (**AAAC Darien** · 559,5 MCM · 19 hilos · Ø 21,79 mm · 283,5 mm² · 545 A). Falta `p_func`
en los 26 apoyos, y sin ella no hay tramos de tensión ni cálculo mecánico.

Se dedujo por **deflexión**, con el mismo criterio del módulo original (<3° suspensión · <15°
suspensión angular · <30° ángulo · ≥30° retención):

| Apoyo | Deflexión | Función que impone la geometría |
|---|---|---|
| E01 | — | Terminal (origen) |
| **E022** | **64,7°** | Retención / anclaje |
| **E04** | **50,2°** | Retención / anclaje |
| **E06** | **118,2°** | Retención / anclaje — la línea casi se dobla sobre sí misma |
| **E20** | **76,0°** | Retención / anclaje |
| **E21** | **58,6°** | Retención / anclaje |
| E24 | — | Terminal (final) |

Los otros 19 apoyos quedan en suspensión o suspensión angular (máximo 11,2°).

> ⚠️ **E06 es 118,2°, no los 119,3° del módulo original** (verificado 2026-08-03 sobre los datos de
> producción): el ángulo del original contaba el empalme «EMP TUB» como si fuera un vértice de la
> línea, y un empalme no dobla nada — cuelga a mitad de vano. Por eso su factor de amplificación es
> **×1,716 (71,6 % más carga), no ×1,726**. Lo mismo, en pequeño, en sus dos vecinos: E05 4,3° → 3,5°
> y E07 1,0° → 0,0°. La función estructural no cambia en ninguno. Corregido en el motor por `ADR-014`
> (la deflexión la manda la geodésica); el `99 §ADR-006` ya lo había cazado en el exporte.

> **Confirmación independiente.** La investigación de falla incrustada en el propio HTML afirma que
> E20 y E21 tienen deflexiones de **76,03°** y **58,65°** y que *"ninguna de las dos puede ser de
> suspensión"*. El núcleo recalculó **76,0°** y **58,6°** partiendo solo del GPS. Coincide: el motor
> reproduce el análisis de falla original sin haberlo visto.

### Los seis tramos de tensión — y por qué un VIR único sería un error

| Tramo | Vanos | Longitud | **VIR** |
|---|---|---|---|
| 1 · E01 → E022 | 1 | 100 m | 99,9 m |
| 2 · E022 → E04 | 2 | 256 m | 128,0 m |
| 3 · E04 → E06 | 3 | 145 m | **51,4 m** |
| 4 · E06 → E20 | 15 | 1 678 m | 142,0 m |
| 5 · E20 → E21 | 1 | 13 m | **13,4 m** |
| 6 · E21 → E24 | 3 | 737 m | **296,8 m** |

El vano ideal de regulación de la línea **completa** sería 188,78 m, pero por tramo va de **51,4 m a
296,8 m** — un factor de casi 6. Calcular la línea entera con un solo VIR de 188,78 m daría flechas y
tiros equivocados en los dos extremos del rango: **sobrestimaría** la tensión en el tramo 3 y la
**subestimaría** en el tramo 6, que es justo donde están los vanos de 294,8 y 336,7 m. Por eso el
cálculo se hace **por tramo**, nunca por línea.

⚠️ Estas funciones estructurales son una **propuesta de la geometría**, no un dato de campo
verificado. Antes de emitir cualquier cálculo con valor de entrega, el Ingeniero confirma los cinco
apoyos de anclaje (`docs/10 · TODO-18`).

---

## §10 — CORRECCIÓN: no todo punto levantado es un apoyo

> **Un empalme no sostiene el conductor.** Puede estar a mitad de vano. Contarlo como apoyo parte un
> vano real en dos falsos y **cambia el cálculo mecánico**.

El módulo de campo original ya lo resolvía —filtra `tipo === 'Estructura'`— y en el primer análisis
de este proyecto **se pasó por alto**. Consecuencias de la corrección en LN-627:

| | Antes (mal) | Ahora (correcto) |
|---|---|---|
| Puntos levantados | 26 | 26 |
| **Estructuras** | 26 | **24** (2 son empalmes) |
| **Vanos** | 25 | **23** |
| Vano E05→E06 | 43,1 + 39,5 (dos falsos) | **82,6 m** |
| Vano E06→E07 | 84,4 + 163,5 (dos falsos) | **247,8 m** |
| VIR de la línea | 188,78 m | **198,20 m** |
| Reparto de tramos | 1-2-3-15-1-3 | **1-2-2-14-1-3** |

El error escondía un **vano real de 247,8 m** detrás de dos de ~84 y ~164 m. Como la flecha crece
con el cuadrado del vano, ocultar un vano largo es precisamente el error que más engaña.

### Nombres: el GPS no manda

El levantamiento grabó nombres irregulares. La línea tiene sus nombres canónicos y **conviven los dos**:
el de campo es la trazabilidad con el levantamiento, el canónico es el que ve el ingeniero.

| Grabado en el GPS | Canónico |
|---|---|
| `LN 627 E022` | **LN-627 E02** |
| `627 EMP TUB` | LN-627 EMP E05-E06 *(empalme)* |
| `EMPT` | LN-627 EMP E06-E07 *(empalme)* |
| `E02` | **LN-627 E07** |

> Ese último es el más traicionero: el punto que el GPS llama `E02` **no es** el apoyo E02 de la
> línea, es el **E07**. Ordenar o identificar por el nombre de campo produce disparates.

### Verificación contra el módulo original

Recalculado sobre 24 estructuras y contrastado con el HTML del Ingeniero: **coinciden** longitud
(2.929 m), distancia directa entre extremos (2.479 m), vano promedio (127,35 m), máximo (336,70),
mínimo (13,35), mediana (99,91), relación máx/mín (25,2×), y el par de vanos extremos
(máx E22→E23, mín E20→E21).

Única diferencia: la **desviación estándar** — 78,74 m en el módulo original contra 77,01 m calculada
como población. El original usa la fórmula de **muestra** (÷ n−1). Se adopta la del original por
coherencia con lo que el Ingeniero ya validó, y queda anotado que para una enumeración completa de
los vanos la de población sería la defendible.

---

## §9 — El mapa: lo que hoy NO funciona en campo

El módulo actual pide las teselas del mapa a dos servidores de internet:

```js
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19, …})
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/…')
```

**Sin señal el mapa es un lienzo gris.** Lo que sí sobrevive offline son los datos, todo el cálculo y
el esquema geométrico en SVG. Además, la política de uso de `tile.openstreetmap.org` **prohíbe
textualmente el uso offline** y la descarga anticipada de teselas, y los planes gratuitos de MapTiler
y Stadia **prohíben el uso comercial** — un entregable a cliente sería incumplimiento desde la
primera carga.

**Camino decidido:** Protomaps / PMTiles servido desde almacenamiento de objetos, con **recortes por
línea** y MapLibre. Un solo archivo, servido por peticiones de rango HTTP, licencia BSD, datos ODbL
con atribución visible a OpenStreetMap. Sin cuota, sin contrato y **offline por diseño**.
Detalle → `30 · L-03` y `L-10`.
