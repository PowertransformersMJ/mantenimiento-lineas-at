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

**Dato real verificado de LN-627 (levantamiento de JULIO):** **24 estructuras** (más 2 empalmes, que
NO son apoyos — ver §10) · **23 vanos** · 2,929 km · vano medio 127,35 m (mínimo 13,35 m — el par de
retención E20–E21 — máximo 336,70 m) · **VIR = 198,20 m**.
Con la **ampliación fechada del 11-12 AGO 2026** son **25 estructuras · 24 vanos · 3,024 km · vano
medio 125,99 m**, y el máximo y el mínimo no cambian. La tabla completa y lo que deja de ser cierto
decir, en **§10**.

> ⚠️ **El VIR de la línea completa SÍ cambia: 198,20 → 195,79 m** (verificado con el motor el
> 2026-08-16). No aparece arriba junto al vano medio porque no es la misma clase de cifra, y
> confundirlas hace firmar un número equivocado: **el VIR que gobierna el cálculo es el de CADA
> TRAMO DE TENSIÓN, no el de la línea**. Los seis tramos de hoy **no cambian ni uno** —el pórtico
> entra detrás de E24, que sigue siendo ancla— y aparece un **séptimo tramo** de un solo vano de
> 94,65 m. El 195,79 es descriptivo del conjunto; el que entra en la ecuación de cambio de estado
> sigue siendo el del tramo. Nada de esto está sembrado todavía: hasta que se cargue la ampliación,
> lo que la aplicación produce son las cifras de julio.

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

**LA CONDICIÓN DE REFERENCIA, y quién la eligió (`99 §ADR-093`).** Como la condición ES el veredicto,
el sistema tiene UN solo dueño de las seis: `condicionesDeAmpacidad()` en `nucleo/termica.js`. Toma
lo que el Ingeniero haya declarado en `hipotesis.condicionTermica` y, para lo que no haya declarado,
**adopta la condición de referencia de esta tabla y lo dice en cada número que publica**:

| | Valor | |
|---|---|---|
| Ambiente | 32 °C | Emisividad 0,5 |
| Viento | 0,61 m/s | Absortividad 0,5 |
| Sol | 1 000 W/m² | Altitud 10 msnm |

Con ella, el Darien AAAC da **718 A**. La regla es que **adoptar no está prohibido; adoptar en
silencio sí**: mientras el Ingeniero no ratifique (con autor, fecha y fuente), la pantalla, el CSV y
el informe firmable declaran las condiciones como **ADOPTADAS**.

---

### 4.3 Cargabilidad — la palabra que faltaba en este diccionario

> **Definida el 2026-09-01 por el Ingeniero.** Hasta ese día la palabra que él más usa **no
> aparecía ni una vez en este nodo**, y ésa es la causa raíz de dos errores documentados:
> irse a buscarla al proyecto de transformadores (`30 · M-02`) y contestarla mezclando lo
> eléctrico con lo mecánico. Un término del dominio que no está escrito se reinventa cada vez.

**Cargabilidad NO es una medida: es un COCIENTE.** Y vale lo que valga su denominador.

```
cargabilidad (%) = corriente de operación (A) ÷ capacidad (A) × 100
```

**Hay dos denominadores posibles, y NO son intercambiables:**

| Denominador | Qué es | Cómo se comporta | Quién lo produce |
|---|---|---|---|
| **Capacidad nominal** | El valor de placa, de catálogo | **Fijo** | Viene en el archivo de SCADA |
| **Ampacidad** (`§4.2`) | La capacidad REAL del conductor con el clima de ese momento, IEEE 738 | **Se mueve** con ambiente, viento y sol | `nucleo/termica.js` |

Los mismos amperios pueden dar **71 % contra la nominal y 98 % contra la ampacidad de un día en
calma**. No es que uno esté mal: responden a preguntas distintas.

**LA REGLA, palabras del Ingeniero (2026-09-01):**

> *«Lo único con lo que podría comparar la cargabilidad de manera constante es la ampacidad —es
> decir, la capacidad en corriente de la línea—; del resto, seguimiento operativo de la línea.»*

De ahí salen las dos mitades del módulo, y no se mezclan:

1. **El VEREDICTO** — corriente de operación contra **ampacidad**. Es lo único que dictamina.
   Lo calcula `contrasteConLaAmpacidad` en `nucleo/cargabilidad.js`.
2. **EL SEGUIMIENTO OPERATIVO** — tendencias, picos, mapa de calor, reparto por bandas. Describe
   cómo se comportó la línea. **No dictamina nada**, y la pantalla no puede insinuar que sí.

**Las bandas 80/90/100 son de LECTURA, no norma.** Son convención de operación para leer el mapa de
un vistazo. Un color no es un dictamen.

⚠️ **Cargabilidad ≠ Cargas.** «Cargabilidad» es ELÉCTRICA (A y %). «Cargas» es la carga
ESTRUCTURAL sobre el apoyo (kgf) y su `utilizacion_pct` es **otro veredicto distinto**. Son dos
pestañas, dos dominios y dos firmas. Confundirlas es el enredo que costó `30 · M-02`.

⚠️ **De dónde salió el porcentaje se declara SIEMPRE** (`naturaleza`): `declarada` si venía en el
archivo, `derivada` si lo calculó este sistema. Un porcentaje sin naturaleza no dice contra qué
capacidad se calculó, y por tanto no significa nada (`99 §ADR-091`).


### 4.4 Las variables operativas, y cuál de ellas decide

**El veredicto lo decide LA FASE MÁS CARGADA, nunca el promedio.** El conductor que primero llega a
su límite es el que descuelga y el que fija el gálibo; promediar las tres esconde justo la que está
peor. El **desbalance** es lo que permite decir cuánto esconde ese promedio:

```
desbalance % = ( |máxima desviación respecto al promedio| ÷ promedio ) × 100
```

⚠️ **La corriente RESIDUAL no se puede calcular con las magnitudes.** Es la suma **fasorial** de las
tres, y sin los ángulos no sale. Sumar los módulos daría un número que se leería como corriente a
tierra sin serlo. El sistema se niega y dice qué pedirle al SCADA (`nucleo/electrica.js`).

**La reactiva no hace trabajo, pero ocupa conductor.** Es la única palanca que devuelve capacidad
sin obra:

```
corriente gastada en reactiva:  I_Q = Q ÷ (√3 · V)
```

Medido en LN-627 con su pico de 502 A a 66 kV (S = 57,4 MVA): con factor de potencia **0,90 son
219 A —el 44 %— que no transportan energía**. Compensar hasta 0,98 liberaría unos 119 A.

**Pérdidas por efecto Joule**, `3 · I² · R · longitud`. Con el Darien AAAC en los 3,03 km de LN-627 y
502 A: **282 kW a 32 °C · 299 a 50 °C · 337 a 90 °C**. La resistencia sube con la temperatura, así
que la temperatura **se declara siempre**: entre esos dos extremos hay un 19 % de diferencia. Y como
van con el CUADRADO de la corriente, la parte reactiva también se paga aquí.

**Los tres límites de cargabilidad de una línea** son el térmico, la caída de tensión y la
estabilidad. En LN-627 —**3,03 km a 66 kV**— gobierna el **térmico** con diferencia; los otros dos
empiezan a morder en decenas y centenas de kilómetros. Por eso la cargabilidad se mide contra la
ampacidad. Pero la tensión entra por otra puerta: **con la misma potencia, si la tensión baja la
corriente sube**, y es la corriente la que calienta. Un hueco de tensión no relaja el veredicto: lo
empeora.

⚠️ **La banda admisible de tensión NO está declarada** en este sistema, y no se cita de memoria
(`30 · L-09`). La pantalla publica la desviación respecto a la nominal y deja el veredicto sin
emitir hasta que el Ingeniero declare su criterio.


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

## §8.3 — LN-627 mezcla al menos CUATRO tipologías (leído en fotografía, 2026-08-06)

Leyendo las fotos del recorrido de levantamiento aparecieron **cuatro tipos de estructura distintos
en las 12 que tienen foto**. La línea no es homogénea, y eso no es un detalle de inventario: es un
problema de MODELO.

| Apoyo | Tipología observada | Función que se ve | En qué foto |
|---|---|---|---|
| **E01** | Pórtico de concreto de **2 postes** | Terminal, salida de subestación: las 3 fases rematan en amarre y salen en abanico | `e01-01` |
| **E02**, **E03** | Pórticos de concreto de **3 postes**, tres ménsulas | Amarre: cadenas horizontales en tensión, con puentes | `e02-01`, `e02-18` |
| **E07** | **Torre metálica reticulada** autosoportada | — | `e09-05` |
| **E12** | **Poste de concreto simple** | Suspensión | `e14-01` |

⚠️ Recordar el mapeo de `99 §ADR-015`: el número del archivo es el del PUNTO, y `e07` es E06.

### Por qué esto importa más que el dato suelto

**El modelo de capacidad que hoy tiene el contrato es de POSTE**: una carga de rotura ensayada en la
punta (`cargaRotura_kgf`), comparada como momento contra la altura libre (`alturaLibre_m`). Ese
modelo describe bien un poste de concreto simple — E12 — y **no describe** los otros tres:

- Una **torre reticulada autosoportada** no tiene «carga de rotura»: tiene un **árbol de cargas** por
  punto de amarre, con transversal, longitudinal y vertical declaradas por separado. Compararla con
  un momento único daría un porcentaje impecable y sin significado.
- Un **pórtico de 2 o 3 postes** reparte la carga entre varios elementos y sus ménsulas. La rotura de
  un poste aislado no es la capacidad del conjunto.

**Consecuencia práctica:** la «ficha estructural» que hoy bloquea los 24 veredictos **no es un
formulario, son tres o cuatro**. Antes de salir a buscar datos conviene decidir qué se le pide a cada
tipo — y es decisión de ingeniería, no de programación (`TODO-59`).

### Lo que la fotografía NO puede dar, y no es opinable

- **La altura libre.** Depende del empotramiento, que está bajo tierra **por definición**. Ninguna
  cámara la ve, y estimarla por comparación con una persona o un vehículo es exactamente lo que este
  sistema rechaza.
- **La carga de rotura.** Es un valor de ENSAYO. Solo aparecería si una foto pillara una placa de
  fabricante; en las revisadas no hay ninguna (sí hay placas de NUMERACIÓN, que es otra cosa).
- **La capacidad longitudinal**, que además depende de la sección y de si hay retenida.

### Dato de campo: **ningún apoyo de LN-627 tiene retenida** (declaración del Ingeniero, 2026-08-21)

Lo dijo así: *«ningún apoyo tiene retenida, todos son autosoportados»*. Cierra **una** de las dos
incógnitas que el contrato nombra al prohibir usar `cargaRotura_kgf` como capacidad longitudinal, y
hay que decir cuál, porque la que queda es la peligrosa:

| Modo de error que cabía en ese número | ¿Sigue vivo? |
|---|---|
| «REVISAR» sobre un terminal **retenido sano** (falsa alarma) | ❌ **Descartado**: no hay ni una retenida |
| «CUMPLE» sobre un poste con el **eje débil** hacia la línea (falsa tranquilidad) | ✅ **SIGUE VIVO**: la sección no está declarada |

Así que **NO habilita** deducir la capacidad longitudinal de la carga de rotura, y el sistema debe
seguir sin intentarlo. Segunda consecuencia, práctica: cuando el eje longitudinal empiece a decir
«hace falta retenida a un lado o a los dos», serán **recomendaciones de instalar algo que no
existe**, no comprobaciones de que lo instalado basta — y eso cambia un presupuesto.

**No cabe en el modelo todavía** y por eso no se guardó: `TipoApoyo` es material y forma, no
configuración, y no hay campo de retenida en el contrato. Es propiedad **del APOYO, no de la línea**
(`TODO-76`). Declaración completa, con lo que NO contesta: bóveda,
`datos-campo/2026-08-21-apoyos-autosoportados.md`.

De los cinco datos de la ficha, el único observable en una fotografía es **cuántos conductores
amarran** — y aun ése es una observación que confirma una persona (`99 §ADR-004`).

### Hallazgo suelto que no necesita ficha

En **E12** se ve vegetación trepando por el poste y arbolado denso bajo la línea. Es accionable hoy y
encaja con la familia «vegetación y servidumbre» del método RCA.

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

### AMPLIACIÓN fechada del 11-12 AGO 2026 — no es una corrección

> Todo lo de arriba es el levantamiento del **25-26 de julio** y **sigue siendo cierto de él**.
> La línea no estaba mal medida: estaba **incompleta**. Ampliar es un hecho fechado (`CLAUDE.md §3.1`).

La cuadrilla volvió el 11 y 12 de agosto. El Ingeniero aprobó **dos** puntos el **2026-08-16** —un
**empalme** dentro del vano E03→E04 y el **pórtico del extremo final**, apoyo real a 94,65 m de E24—
y dejó el **pórtico del extremo de origen PENDIENTE DE VERIFICACIÓN** (no descartado). Cifras
derivadas ejecutando el motor, selladas en `tests/ampliacion-2026-08.test.js`:

| | JULIO (25-26 JUL) | + AMPLIACIÓN (11-12 AGO) |
|---|---|---|
| Puntos levantados | 26 | **28** |
| Estructuras | 24 | **25** |
| Empalmes | 2 | **3** |
| Vanos | 23 | **24** |
| Vano promedio | 127,35 m | **125,99 m** |
| Mediana | 99,91 m | **99,89 m** |
| Desviación (muestra) | 78,74 m | **77,30 m** |
| Coeficiente de variación | 61,83 % | **61,35 %** |
| Vano máximo / mínimo | 336,70 / 13,35 m | **los mismos** — el vano nuevo no es extremo |
| Longitud levantada | 2.929,02 m | **3.023,67 m** |
| Tramos de tensión | 6 · `1-2-2-14-1-3` | **7 · `1-2-2-14-1-3-1`** |
| Anclas | 7 | **8** |

**Lo que deja de ser cierto decir:** que LN-627 mide 2.929 m (es lo LEVANTADO, no la línea) · que
tiene 24 estructuras (son las levantadas) · que E01 y E24 son los terminales (son los extremos del
LEVANTAMIENTO; los terminales son los pórticos) · que E02 es «la segunda estructura saliendo de la
subestación» — es la segunda del levantamiento, y antes hay **entre 14 y 35 estructuras sin levantar**.

**El tramo que falta NO es un vano.** Del pórtico de origen a E01 hay **4.604 m en recta** con la
línea intermedia sin levantar. Meterlo como vano daría 13,7 veces el vano máximo real —imposible en
66 kV— y llevaría el promedio de 127,3 a 305,1 m (+140 %), envenenando flecha, viento y veredicto
mecánico. Es **recorrido de campo pendiente**, no un hueco de la aplicación.

**Pregunta abierta, no decidida:** el pórtico final se tipifica **'Terminal'** (un pórtico de
subestación ancla el conductor por definición) y **E24 se queda como está sembrado, también
'Terminal'**, aunque ahora la línea siga más allá de él. Re-tipificar un apoyo es decisión del
**Ingeniero**, no del sembrador, y arrastra el cálculo mecánico. Mientras tanto queda un tramo final
de un solo vano entre dos terminales consecutivos. → `99 §ADR-027`.

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
Detalle → `31 · L-03` y `L-10`.
