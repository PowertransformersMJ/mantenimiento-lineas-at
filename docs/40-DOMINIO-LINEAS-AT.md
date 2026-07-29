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

**Dato real verificado de LN-627:** 26 apoyos · 25 vanos · 2,929 km · vano medio 117,2 m
(mínimo 13,4 m — el par de retención E20–E21 — máximo 336,7 m) · **VIR = 188,78 m**.

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
