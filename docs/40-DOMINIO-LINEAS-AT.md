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

> ⚠️ **El EDS como % de RTS NO es el criterio de fatiga vigente. Es H/w.** CIGRÉ (Task Force B2.11.04, base de la Technical Brochure 273) descartó el EDS como criterio de vibración eólica —la carga de rotura «no está simplemente relacionada con la falla por fatiga»— y lo sustituyó por el **parámetro de catenaria C = H/w** (tiro horizontal en EDS ÷ peso por metro, en metros). Para **conductor simple SIN amortiguadores** el límite depende del terreno: categoría 1 = **1.000 m** · 2 = 1.125 m · 3 = 1.225 m · 4 = 1.425 m; tope absoluto 2.500 m. La categoría 1 es «terreno abierto, plano, sin obstrucción, con nieve, o **cerca de / cruzando grandes cuerpos de agua**»: LN-627 cae ahí por la segunda mitad de la definición, no por la nieve — que nadie lo «corrija» después.
>
> **Estado en este sistema (medido 2026-09-02):** el motor YA calcula C = H/w en EDS —`nucleo/umbrales.js`, indicador 4 `parametro_catenaria_vibracion`— pero con una **bandera práctica de 1.800 m rotulada «sin norma»**. Con los valores que el motor usa en sus pruebas (w = 0,776 kg/m · RTS = 8.528 kgf, `tests/nucleo.test.js:129-130` — del módulo de campo, NO de hoja de fabricante): EDS 20 % → H = 1.706 kgf → **C ≈ 2.200 m, más del doble del límite CIGRÉ de categoría 1** y por encima incluso de la bandera de 1.800. Cumplir 1.000 m sin amortiguadores exigiría H = 776 kgf = **9,1 % de RTS**, fuera de la banda 18-22 % del indicador 2. Lectura: **para este conductor en este sitio, la vía no es destensar, son amortiguadores** (equipo nuevo sobre apoyos autosoportados, §8.3). Los límites CIGRÉ CON amortiguadores existen en la misma fuente pero **NO se leyeron: NO VERIFICADO**, no se citan.
>
> **Decisiones que esto abre (suyas, no del sistema):** ① cambiar el umbral del indicador 4 de 1.800 → 1.000 m con fuente CIGRÉ TB 273 y categoría de terreno declarada en la hipótesis (es un cambio de veredicto, va por ADR); ② confirmar en campo si LN-627 tiene amortiguadores Stockbridge —hoy el sistema no lo sabe—; ③ inspeccionar primero los hilos junto a las grapas de suspensión de los vanos de mayor H/w (E22→E23, 336,70 m).
>
> ⚠️ **Contradicción interna detectada:** §3.1 dice «EDS 20 % RTS = 3.524 kgf»; 3.524 kgf es el **41,3 %** de los 8.528 kgf que usa el motor. O la RTS de §3.1 es otra, o el 3.524 no es EDS.
>
> ✅ **MEDIA CONTRADICCIÓN CERRADA el 2026-09-05** (`99 §ADR-098`). La RTS **ya está verificada contra hoja de fabricante**, que era la condición que faltaba: **8.527–8.528 kgf en SEIS fichas independientes** —CENTELSA 8.527 kgf · Nexans Brasil 8.527,8 · Prysmian 8.528 · Electrocable 8.527 · VIAKON 83,6 kN · el grupo estadounidense 18.800 lbf (= 8.528 kgf)—. El valor que usa el motor es el correcto y **ya no depende del módulo de campo**.
>
> ⚠️ **Lo que sigue abierto es el 3.524 kgf de §3.1**: con la RTS confirmada, ese número NO puede ser el 20 % de RTS. O está mal rotulado, o el EDS de esta línea es del 41,3 % — que sería el doble de la banda 18-22 % del indicador 2 y una decisión con consecuencias. **Sigue sin firmarse** hasta que el Ingeniero diga cuál de las dos cosas es (`30 · L-09`, `M-01`).
>
> Fuente: CIGRÉ TF B2.11.04 (C. Hardy), tutorial «Conductor Safe Design Tension with respect to Aeolian Vibrations», Colloquium Río 2005 / IEEE TPC 2009 — copia espejo en el sitio del IEEE TPC, leída íntegra; la cita canónica firmable es CIGRÉ TB 273 (original de pago, `31 · L-78`). https://www.oocities.org/ieee_tpc/ieee_tutorials/CIGRE_SAFE_DESIGN_TENSIONS.pdf · consultado 2026-09-02.

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

⚠️ **QUIÉN VERIFICÓ QUÉ, Y HASTA DÓNDE.** La norma vigente sí está confirmada de primera mano
(2026-09-02): **Resolución 40117 del 2 de abril de 2024** del Ministerio de Minas y Energía,
publicada el 3 de abril en el Diario Oficial 52.716, cuatro Libros, transición de 15 meses —
**derogó el Anexo General de 2013**, así que cualquier documento que cite «Artículo 13» cita norma
derogada. También está confirmada la regla de altitud (+3 % por cada 300 m sobre 1.000 msnm, para
tensiones > 57,5 kV).

**PERO LA TABLA DE ABAJO NO LA ABRÍ YO.** Vive en el **Libro 3**, que no está en el extracto
público que consulté; los valores vienen de la investigación, que declara haberlos leído en el PDF
oficial. **Antes de que un despeje de esta línea se firme contra estas cifras, hay que abrir el
Libro 3 y confirmarlas** (`30 · L-09`). Se escriben aquí para saber qué buscar, no para citarlas:

| Tabla 3.10.2.a · 66/57,5 kV | Valor |
|---|---|
| `d` cruces con carreteras, calles y áreas con tráfico vehicular | **5,8 m** |
| `d1` líneas que recorren avenidas, carreteras y calles | **5,8 m** |
| `d` bosques de arbustos, cultivos, pastos y huertos **con control de la altura de copas** | **5,8 m** |
| `e` bosques y huertos **donde no se controla el crecimiento**, maquinaria agrícola alta, cruce de ferrocarril sin electrificar | **8,3 m** |
| `f` vertical sobre alimentadores de ferrocarril electrificado, teleférico, tranvía | 2,0 m |

- **La rocería decide el umbral:** 5,8 m si hay evidencia vigente de control de vegetación bajo el vano, 8,3 m si no. La hipótesis `despejeMinimo_m` debe poder declararlo **por vano**, y la evidencia de servidumbre (abajo) es lo que la sostiene. La diferencia son 2,5 m de flecha admisible.
- **Corrección por altitud: 0 %.** La Nota 3 del Título 10 sube 3 % por cada 300 m por encima de 1.000 msnm; LN-627 está a ~10 msnm. Dejarlo escrito para que nadie la aplique.
- **Se calcula con la MÁXIMA tensión de operación, no con los 66 kV nominales** (misma Nota 3, para >50 kV).
- **Servidumbre (Art. 3.19.1, Tabla 3.19.1.a): 57,5/66 kV, uno o dos circuitos = 15 m de ancho, centrado en el eje.** El literal g) obliga a hacer uso periódico de la franja y a «dejar evidencia de todas las actividades desarrolladas». El corredor es geometría sobre el eje que ya está levantado: 7,5 m a cada lado, sin dato nuevo de campo. **El RETIE NO fija periodicidad numérica** para revisar la servidumbre de una línea: la fija el Ingeniero por escrito, y el tablero mide contra ese criterio.

⚠️ Regla de uso: **estos valores son los de la norma, no una hipótesis adoptada.** Igual entran a la hipótesis con autor, fecha y fuente (`§4.2`, «adoptar en silencio no»). Y una página divulgativa consultada antes transcribía mal las columnas de estas mismas tablas: **se usa el PDF oficial, no réplicas.**

Fuente: RETIE, Res. 40117/2024, Libro 3, Art. 3.10.2 Tabla 3.10.2.a (hojas 28-30), Nota 3 del Título 10 (hoja 36), Art. 3.19.1 y Tabla 3.19.1.a (hojas 101-102). https://www.minenergia.gov.co/documents/11566/4._Libro_3_-_Instalaciones.pdf · consultado 2026-09-02.

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

**El mecanismo se llama recocido, y no es una puerta: es un contador.** Cada hora que el conductor pasa por encima del umbral se cobra en resistencia mecánica perdida, para siempre. La norma que gobierna el cálculo es **IEEE Std 1283** («Guide for Determining the Effects of High-Temperature Operation on Conductors, Connectors and Accessories»; edición vigente 2013, citada 2004 en la ponencia). ⚠️ **NO se abrió la norma: no hay aquí ni una ecuación ni un umbral de ella — NO VERIFICADO.**

**Fin de vida = un número, no una fecha.** Ponencia CIGRE US 2019: la resistencia remanente del conductor se compara contra un límite «que debe ser definido por los parámetros de diseño de la línea»; con el histórico se obtiene la tasa anual y la vida remanente. El 80 % de su figura 3 es **el caso de ellos, no norma**: el límite de LN-627 lo declara el Ingeniero.

**Solo hay tres mecanismos que matan un conductor** (Univ. de Queensland para cinco operadores australianos, 800.000 km): recocido, corrosión y fatiga por rozamiento. Estadística de fallas: **corrosión/óxido 30 % (causa nº 1)**, fatiga 19 %, empalmes 9 %; y **el 92 % de las fallas de conductor de aluminio ocurrió a menos de 100 km del mar**. Las roturas por fatiga ocurren «cerca de» grapas, aisladores y amortiguadores — no a mitad de vano. Las tres cosas que se fotografían de cerca: **polvo blanco, hilos rotos junto a grapa, galvanizado del herraje**. Un AAAC es monometálico: la corrosión galvánica del ACSR no le aplica DENTRO del cable; **la interfaz grapa de acero galvanizado–aluminio SÍ es par galvánico, y eso es inferencia de ingeniería, no cita: verificar antes de escribirlo como criterio.**

**Lo que este sistema puede hacer hoy y nadie de su tamaño tiene junto:** `nucleo/cargabilidad.js` ya trae la corriente hora a hora del SCADA y `nucleo/termica.js` resuelve IEEE 738. Falta la **inversa** (temperatura del conductor a partir de corriente + clima de esa hora) y **acumular horas por encima del umbral desde ya** — si no se archiva, la pérdida de resistencia es irrecuperable. Es decisión de modelo de datos (8.760 registros/línea/año, `10 · punto 0`), no de compra.

Fuentes: Marmillo, Pinney, Biedenbach, Toth, «Transmission Line Conductor Asset Health Assessment with Non-Contact Monitoring Technology», CIGRE US NC 2019 — https://cigre-usnc.org/wp-content/uploads/2019/10/5E_3.pdf · Naranpanawe, Ma, Saha, «Overhead Conductor Condition Monitoring – Milestone Report 1», UQ / Energy Networks Australia, dic. 2018 — https://www.energynetworks.com.au/news/conductor-condition-monitoring-milestone-1-report/ · IEEE 1283 (título y alcance verificados, texto no abierto). Consultados 2026-09-02.

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
> pesa más que la temperatura ambiente.
>
> ⚠️ **ESTE PÁRRAFO DECÍA «la ampacidad de placa es engañosa … no citar el catálogo», y se
> RECTIFICÓ el 2026-09-05 por orden del Ingeniero** (`99 §ADR-098`). La cifra del catálogo no es
> engañosa: es trazable, auditable y no depende de supuestos nuestros. Lo engañoso es usarla **sin
> sus condiciones**. Las dos cosas son ciertas a la vez y por eso el sistema publica las dos: la del
> fabricante como valor de REGISTRO, y el cálculo como CONTRASTE del día.

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

### 4.2.1 La ampacidad la dice el FABRICANTE — orden del Ingeniero, 2026-09-05

> *«la ampacidad debe ser lo que dice el fabricante conforme a sus especificaciones técnicas»*

**La regla:** cuando la línea declara `conductor.ampacidadDeFabricante`, **esa cifra ES la ampacidad
de registro** y el IEEE 738 baja a CONTRASTE. Cuando no la declara, se calcula y **se rotula
CALCULADA** — nunca en silencio. `nucleo/termica.js · ampacidadDeLinea()` devuelve siempre la
`naturaleza`, y no tiene valor por defecto.

**Por qué la orden es correcta técnicamente, y no solo jerárquicamente:** la cifra del catálogo es
trazable a un documento con nombre y revisión, es auditable por un tercero y **no depende de seis
supuestos nuestros**. En un dictamen que se firma, eso vale más que la precisión aparente de un
cálculo propio con condiciones que nadie ratificó.

#### Lo que se encontró al buscar la ficha real (barrido de 13 fabricantes, 10 PDF leídos en crudo)

| Fabricante | Ampacidad | Condiciones que la ficha DECLARA |
|---|---|---|
| **CENTELSA · Nexans (Colombia)** | **665,0 A** | 25 °C amb · **conductor 75 °C** · 1 kW/m² · ε=α=0,5 · 0,61 m/s · nivel del mar · 60 Hz |
| VIAKON (México) | 656 A | 25 °C amb · conductor 75 °C · 0,61 m/s · soleado · ε 0,5 · **«calculado con IEEE 738-2006»** |
| Southwire · Nehring · Priority · Classic · Electrocable | **663 A** | 25 °C amb · conductor 75 °C · 2 ft/s (0,61 m/s) · pleno sol · ε=α=0,5 · nivel del mar |
| Nexans Brasil | 670 A | ⚠️ **NINGUNA condición declarada en toda la ficha** |
| APAR (India) | 412 A / 514 A | **45 °C amb** · conductor 75 / 85 °C · 0,56 m/s · 1.045 W/m² · ε 0,45 · α 0,80 |
| **Prysmian (ex-General Cable)** | — | ⚠️ **SE NIEGA a publicarla** y remite a calcularla (Tabla 3 de la Aluminum Association) |

**Tres lecturas que ordenan todo lo demás:**

1. **Los fabricantes NO discrepan del cable: discrepan de la condición.** De 412 A a 670 A para el
   mismo Darien, y la diferencia es la temperatura ambiente de referencia (25 °C contra 45 °C), no
   el conductor. La mecánica sí converge: **RTS 8.527–8.528 kgf en SEIS fuentes independientes**,
   masa 776–781 kg/km, diámetro 21,79–21,80 mm.
2. **La tabla del fabricante ES un cálculo IEEE 738.** VIAKON lo dice con todas las letras. No hay,
   por tanto, un conflicto de MÉTODO entre la ficha y nuestro motor — hay un conflicto de
   CONDICIONES, que es exactamente lo que el contraste hace visible.
3. **NADIE publica la ampacidad a los ~32 °C de Turbaco.** Todo el barrido vive en 25 °C o en 45 °C.
   La cifra aplicable a LN-627 **no existe publicada**: o se calcula, o se le pide por escrito al
   fabricante. Cualquier número que se use hoy viene de una condición ambiental que no es la del
   sitio, y eso hay que decirlo en el papel.

#### ⚠️ EL HALLAZGO QUE HAY QUE RESOLVER ANTES DE FIRMAR NADA

**CENTELSA declara para el Darien una temperatura máxima de operación de 75 °C.** Nuestro motor usa
los **90 °C** genéricos del material AAAC (`MATERIALES.AAAC.tMaxContinua`), y de ahí salen los 718 A
de `§4.2`. A 75 °C **el mismo cálculo da 611 A**.

> Si el conductor de LN-627 es el de CENTELSA, **el sistema lleva publicando un 17 % de capacidad de
> más**, siempre por el lado optimista — que es el lado que hace que una línea sobrecargada parezca
> sana. NO se corrige por mi cuenta: **no consta quién fabricó el conductor de esta línea**, y
> suponerlo sería el error que este apartado entero existe para impedir.

**Lo que cierra esto:** el Ingeniero dice de qué fabricante es el conductor y aporta su ficha. Con
eso se declara `ampacidadDeFabricante` y el número deja de ser nuestro.

#### Lo que dicen las NORMAS sobre esta orden (verificado en fuente, 2026-09-05)

**La orden del Ingeniero tiene respaldo normativo explícito, y a la vez ninguna norma la convierte
en obligatoria.** Las dos cosas importan:

| Fuente | Qué dice, verificado |
|---|---|
| **NERC FAC-008-3 · R3.1** | **Admite el valor de placa del fabricante** como base VÁLIDA de un *Facility Rating*: la metodología debe ser consistente con al menos una de tres, y la primera es *«Ratings provided by equipment manufacturers … such as nameplate rating»* |
| **IEEE Std 738-2012 y 2023** | Normaliza **solo el MÉTODO** y se niega explícitamente a decir qué condiciones usar: *«nor does it recommend appropriately conservative weather conditions for the rating of overhead power lines»* |
| **IEEE P738.1** (en redacción) | El propio IEEE reconoce el hueco: la guía existe *«because IEEE 738-2023 does not recommend suitable weather conditions…»*. **Aún no existe publicada** |
| **ASTM B399 / B398** | Fijan geometría, formación y alambre. **No fijan ampacidad** |
| **IEC TR 61597** | Informe Técnico, no norma. Define la capacidad *«for given ambient conditions»* |
| **CIGRÉ TB 601** | Método alternativo. Con las mismas condiciones da resultados **parecidos, no idénticos**: la diferencia es de segundo orden frente a la de las condiciones |
| **Código de Redes (Colombia)** | ⚠️ **VERIFICACIÓN NEGATIVA:** NO declara ninguna condición ambiental de referencia. *«temperatura ambiente»* = **0 apariciones**. Sí define la capacidad de transporte como *«el mínimo valor entre el límite térmico de los conductores, límite por regulación de tensión y el límite por estabilidad»* |
| **ENTSO-E** | La capacidad que da el fabricante lleva condiciones **implícitas**: *«implies certain ambient conditions and is usually provided by the manufacturer»* |
| **FERC Orden 881 · §3 y §35** | El argumento es **bidireccional**: cuando el aire supera el supuesto, los ratings *«may OVERSTATE the near-term transfer capability»* y ponen la línea *«at risk of inadvertent overload»*. Y avisa: AAR da ratings **más exactos, no necesariamente más altos** |
| **EPRI** | *«utilities using traditional static ratings already exceed true line capacity more than 10 % of the time»* |
| **AEP** | Regla de conversión documentada: **la ampacidad cambia ≈ 1 % por cada °C de ambiente** |

**La prueba más contundente de que la ampacidad no es una propiedad del conductor:** **Nexans
Nueva Zelanda publica el MISMO Darien con 30 °C de ambiente y DOS columnas** —«still air» y «1 ft/s»—
mientras Nexans Colombia lo publica a 25 °C con una sola. Mismo fabricante, mismo cable, tres cifras.

**Y la práctica real, medida:** AEP presentó ante el comité nacional de CIGRÉ un contraste de siete
operadores. Temperatura ambiente de verano adoptada: **32,2 · 35 · 36 · 37,7 · 40 · hasta 48 °C**.
Mismo método normativo, hipótesis radicalmente distintas. AEP usa ε=α=0,5; *«the PJM guide (and most
other users) use values between 0.7 and 0.9»*.

> **Lectura para LN-627.** Las fichas de 663–665 A se calculan a **25 °C**. Turbaco está a **~32 °C**.
> El salto térmico que gobierna todo el balance pasa de (75 − 25) = 50 K a (75 − 32) = **43 K**. Con
> la regla de AEP, ≈ **7 % menos**. Por eso la cifra de registro va acompañada del contraste, y por
> eso el contraste no es un adorno.

#### Qué se guarda, y por qué cada campo

| Campo | ¿Obligatorio? | Por qué |
|---|---|---|
| `corriente_A` | **Sí** | Es la cifra |
| `tempConductor_C` | **Sí** | Sin ella no se distingue 611 A (75 °C) de 718 A (90 °C): un 17 % |
| `ambiente_C`, `viento_m_s`, `sol_W_m2`, `emisividad`, `absortividad`, `altitud_m` | No | Hay fichas que **no las imprimen** (Nexans Brasil). Cuando faltan, el sistema lo DICE y **se niega a contrastar** en vez de suponerlas |
| `metodo` | No | `no_declarado` es legítimo y frecuente. Solo VIAKON lo declara |
| `fabricante`, `documento` | **Sí** | Es toda la razón de ser de la orden: sin ellos la cifra no es más trazable que un cálculo |
| `declaradaPor`, `declaradaEn` | **Sí** | Quién puso su firma detrás, y cuándo |

#### DOS NÚMEROS, y no son el mismo

| | Qué es | Quién manda |
|---|---|---|
| **Ampacidad de REGISTRO** (`ampacidad_A`) | La cifra de la ficha, intacta. Es la que se firma, se exporta y se declara | **El fabricante, siempre** |
| **Ampacidad VIGENTE** (`vigente_A`) | El denominador con el que se divide la corriente del día | **El menor** entre la ficha y lo que el clima permite |

> ⚠️ **La vigente NUNCA sube por encima de la declarada.** Una noche fresca con brisa no autoriza a
> pasarse del catálogo: el fabricante pone el techo y el día solo puede bajarlo. Es un **mínimo**,
> no un recálculo — y es la mitad que hace que la cifra del fabricante mande de verdad sin que el
> sistema divida entre una capacidad que el cable no entrega hoy (FERC Orden 881 §35: *«risk of
> inadvertent overload»*).

**Convergencia que valida el motor:** la ficha pública de CENTELSA (665 A a 25 °C, conductor 75 °C)
llevada a los 32 °C de Turbaco da **611 A** — **exactamente** lo que da nuestro motor calculando a
75 °C por su cuenta. Dos caminos independientes, el mismo número: **toda la diferencia con los
718 A era la temperatura del conductor**, no el método.

#### Lo que el contraste dice, y lo que NO decide

`contrasteDeFabricante()` responde tres preguntas y ninguna es un veredicto:

- **¿El sitio honra la cifra de registro?** Si con las condiciones de la línea el conductor da menos
  que lo impreso, se avisa con el porcentaje. **Derratear o no es del ingeniero, no del sistema.**
- **¿Reproduce la ficha?** Recalcula por IEEE 738 con las propias condiciones del fabricante. Una
  diferencia no invalida la ficha: no todos usan el mismo método.
- **¿Se puede contrastar siquiera?** Si la ficha no imprimió sus condiciones, la respuesta es no, y
  se dice.

---

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


### 4.3.1 Dos escalones que la literatura mezcla a propósito, y cuál le toca

| Escalón | Qué varía | Qué exige | Aquí |
|---|---|---|---|
| **Ampacidad ajustada al ambiente (AAR)** | temperatura ambiente real de cada hora (y opcionalmente el sol); **viento fijo en 0,61 m/s adoptado** | ninguna compra: la serie horaria ya llega (POWER/MERRA-2, `ADR-055`) y `cargabilidad.js` ya tiene la hora de cada corriente | **es el siguiente paso** |
| **Ampacidad dinámica (DLR)** | además mide el viento EN la línea | sensores por vano (precio de prensa ~30.000 USD/sensor, **NO VERIFICADO**), sala de control y plan de reversión | no aplica (`31 · L-78`) |

El regulador federal de EE. UU. (FERC, Orden 881, 16-12-2021) hizo **obligatorio** el primer escalón para toda transmisora del país desde el 12-07-2025 y dejó el segundo voluntario: consideró defendible ajustar por temperatura y todavía no por viento. **No es ley aquí: es evidencia de qué escalón es sólido.** Cuánto libera, en pilotos reales (informe del DOE al Congreso, jun. 2019, Tabla 2): Oncor 30-70 % sobre el valor estático, pero **solo 6-14 % adicional** al pasar de AAR a sensores. El dinero grande está en dejar de usar un valor fijo, no en la ferretería.

**Cómo se construye (regla de diseño, no recomendación):**
1. La pantalla muestra **dos columnas**: la de referencia (718 A, ADOPTADA, no se toca) y la ajustada al ambiente con la temperatura de esa hora y su procedencia.
2. **El viento de reanálisis NO entra al cálculo, y el módulo lo hace imposible por construcción.** MERRA-2/ERA5 trabajan sobre malla de ~31 km que aplana el relieve; la misma consulta que da la temperatura devuelve 4,7-6,4 m/s en su costa, y con 2 m/s el Darien ya da 965 A: sería **+35 % sin que nadie haya medido el viento en la línea**. Coincide con el invariante ya escrito en `10`: viento marca hipótesis, en el mapa va como dato del SITIO. La puerta del viento real es un anemómetro en un apoyo, validado.
3. **Sin dato de la hora → cae a la condición de referencia.** Nunca se extrapola ni se arrastra el último valor.
4. Es **retrospectivo** (temperatura con días de retraso, sol con meses): sirve para leer el archivo de SCADA, **no es semáforo de despacho**.
5. Tres riesgos del DOE que le tocan: operar por encima del límite térmico degrada el material sin aviso (`§4.1`); la capacidad la fija **el vano peor refrigerado**, y en 3,03 km ese vano se encuentra en una mañana de cuadrilla (la ficha estructural debe registrar la exposición al viento de cada vano); y **la emisividad/absortividad cambian con el envejecimiento** (CIGRE citado por el DOE, dirección NO VERIFICADA): el 0,5 pasa de «adoptado tolerado» a «adoptado con caducidad».

**Dato útil ya medido:** el satélite (CERES) registró como máximo 908,7 W/m² en su punto de costa; los 1.000 W/m² adoptados son **conservadores**, no optimistas.

⚠️ **Edición:** este nodo y `nucleo/termica.js` citan «IEEE 738» sin edición. Existe la **738-2023** (revisión de la 738-2012). La procedencia exige decir contra cuál se calculó (`30 · L-09`).

**Punto de inflexión (método DAPP, Programa Delta holandés):** para horizontes de décadas no se predice el clima de 2050; se declara **la condición bajo la cual el diseño deja de servir** —el par (temperatura, viento) en que 718 A ya no cubre la corriente que la línea debe llevar— y se vigila una señal con tendencia (la media de las horas más cálidas del año), no el pico extremo, que casi nunca ocurre y por eso no avisa a tiempo. Se calcula UNA vez con lo que ya hay.

Fuentes: DOE, «Dynamic Line Rating — Report to Congress», jun. 2019 — https://www.energy.gov/oe/articles/dynamic-line-rating-report-congress-june-2019 · FERC Orden 881 (texto original no leído; fechas por 4 secundarias coincidentes) — https://www.federalregister.gov/documents/2022/05/25/2022-11233/managing-transmission-line-ratings · ERA5 resolución 0,25° — https://docs.meteoblue.com/en/meteo/data-sources/era5 · NASA POWER horaria, probada en vivo lat 10,9/lon −74,8 — https://power.larc.nasa.gov/docs/services/api/temporal/hourly/ · Haasnoot, Warren, Kwakkel, DAPP, cap. 4 de «Decision Making under Deep Uncertainty», Springer 2019, CC BY 4.0 — https://research-portal.uu.nl/ws/portalfiles/portal/237168501/978-3-030-05252-2_4.pdf · IEEE 738 — https://standards.ieee.org/ieee/738/10207/ . Consultados 2026-09-02.

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

**La cámara infrarroja ve calor, y el calor depende de la CORRIENTE. La corona depende del CAMPO eléctrico**: aparece con la línea descargada, de noche, en vacío, y no calienta. Se ve con cámara ultravioleta «solar-blind» (de día, desde vehículo, sin desenergizar). Caso documentado (Brady, 2019): una línea de 138 kV inspeccionada cada año con infrarrojo seguía perdiendo aisladores; la causa era corona que ni la ronda térmica ni la visual veían. El mecanismo es el suyo: contaminación salina + poca lluvia → corriente de fuga → degradación del caucho de silicona → agua por la línea de molde → descarga parcial INTERNA; cuando la corona se ve por fuera el aislador ya está perforado. La corona además genera ozono y ácido que atacan al propio aislador.

**Estado en el molde (medido 2026-09-02):** `TipoInspeccion` en `contratos/src/eventos.ts:15` admite `visual_pie · visual_ascenso · termografia · dron · topografia · posfalla` — **no existe `corona`/`ultravioleta`**: aunque mañana se hiciera la ronda, el hallazgo no tendría dónde vivir. Y `contratos/src/rca.ts:213` imputa a la barrera `termografia` la detección del punto caliente: un análisis de falla por corona **culparía al instrumento que físicamente no puede verla**. Cambio ADITIVO pendiente: añadir el tipo de evento y una barrera `inspeccion_corona` — sin renombrar nada (`CLAUDE.md §3.1`).

**Un termograma sin la corriente de esa hora no es interpretable.** El calentamiento va con I² (término Joule del propio IEEE 738); un punto caliente medido un domingo a las 6 con la línea al 20 % es indefendible e indescartable. El archivo de SCADA (`cargabilidad.js`) y la captura con hora y GPS ya existen por separado: la ficha del hallazgo termográfico debe llevar **corriente concurrente y su procedencia**, rellenada por coincidencia de hora, y la ronda se programa en las horas de carga alta que ese archivo ya señala. Gratis, y ninguna herramienta comercial lo da porque ninguna tiene las dos mitades.

⚠️ **IEC TS 60815-1 cambió de edición:** la Edición 2.0 se publicó el **24-11-2025**, reemplaza la de 2008 y añade una clase «f» de contaminación extremadamente pesada (verificado en la tienda IEC: https://webstore.iec.ch/en/publication/61046). **Los mm/kV por clase NO se verificaron** — no se citan; si el aislamiento de LN-627 se discute, se compra la edición 2025 y no se trabaja con la memoria de la de 2008. La clase del sitio se asigna midiendo ESDD/NSDD al menos un año, no suponiéndola.

Fuentes: J. Brady, «The Use of Infrared and Solar-blind UV Cameras and UAS/Drones to Inspect Utility Transmission Lines», 2019 — https://irinfo.org/images/articles/pdf/03-01-2019-brady.pdf · IEC webstore 60815-1 Ed. 2.0 — https://webstore.iec.ch/en/publication/61046 · IEEE 738 término I²R (ya en `nucleo/termica.js`). Consultados 2026-09-02.

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

### 6.1 De condición «texto que nadie suma» a un número por apoyo y por línea

Método publicado con fórmulas completas y acceso abierto (Hashim, Usman, Baharuddin, *Resources* 8(2):80, 2019): tres indicadores —estructural, eléctrico, ambiental— con 14+ ítems (cimentación, pata, cruceta, conductor, aislador, empalme, amortiguador, servidumbre, puesta a tierra, erosión, distancia al terreno). `HI = Σ (Cᵢ · Iᵢ · CFᵢ · AFᵢ)` con C = condición observada, I = peso del ítem (suman 100 %), CF = 0,5 si el vano es crítico y 1,0 si no, AF = factor de edad; `THI = Σ (HIᵢ · Mᵢ)/100`. Clasificación publicada: 75-100 bueno · 50-<75 regular · 25-<50 malo · <25 muy malo, acción inmediata. Pensado para inspección VISUAL de cuadrilla, sin sensores. **Los pesos Iᵢ y Mᵢ del artículo son de la utility malaya: adoptarlos en silencio es lo que este sistema prohíbe.** Los declara el Ingeniero, con fecha; el primer THI de LN-627 es la línea base contra la que se mide si el mantenimiento extiende vida o solo gasta.

**Estado real del molde (medido 2026-09-02):** `contratos/src/activos.ts` tiene `condicion` (Buena/Regular/Mala/Crítica/Sin evaluar), `anioInstalacion`, `aislamiento`, `puestaTierra.resistencia_ohm/medidaEn`, `cableGuardaVanoSaliente`. **NO tiene** corrosión, inclinación, vegetación, espesor de galvanizado, picadura, puesto de anclaje ni accesibilidad de rescate. La tabla de §6 describe el HTML original, no el contrato. Campos a añadir (aditivos) cuando nazca la ficha por tipología (`TODO-59`): `corrosion` en escala de 4 niveles (sin/superficial/algo/sustancial, la que consume CNAIM, `31 · L-78`) · `picaduraMax_mm` (ISO 9223 nota 4: en aluminio la picadura predice mejor que el adelgazamiento) · `espesorGalvanizado_um` · `exposicionViento` del vano · `anclajeCertificado` y `accesoRescate_min` (`41 §3`) · `puestaTierra.propia: sí/no` (Regla de Oro d, `41 §3`).

### 6.2 Un hallazgo repetido se vuelve «así está ese apoyo»: la ficha guarda la PENDIENTE, no el punto

El informe del Columbia (cap. 8, D. Vaughan) documenta el mecanismo: la primera vez que se acepta una desviación «establece un precedente para aceptar, en vez de eliminar»; cada repetición sin consecuencia pasa a leerse como prueba de que el diseño aguanta; el problema incluso se degrada de categoría. Los problemas «mal estructurados» —lentos, sin umbral obvio— son los más riesgosos, y la corrosión de base de un apoyo en la costa es exactamente eso. Tres reglas de modelo de datos, no de discurso: ① un hallazgo se guarda como **serie con la misma identidad de apoyo** (UUID, `CLAUDE.md §3.1`) para que la pantalla pinte la tendencia; ② **bajar la severidad de un hallazgo repetido exige justificación escrita**, dejarla igual no; ③ **la señal AUSENTE se muestra**: qué apoyos llevan N ciclos sin dato — hoy un apoyo sin inspección reciente se ve igual que uno sano (`30 · L-44`, `L-61`; `eventos.ts` ya dice «los que no están, NO se inspeccionaron»). Corolario del apagón de 2003 (informe EE. UU.–Canadá, 2004): el procesador de alarmas murió en silencio y la pantalla siguió tranquila más de una hora; **la ausencia de alarma no es normalidad mientras nadie compruebe que el que alarma sigue vivo** — cada capa que depende de un tercero muestra fecha y origen del dato, y cuando la fuente no responde lo DICE en vez de conservar lo último (`30 · L-56`, un paso más).

### 6.3 Antes de la primera salida de la ficha estructural: media hora de premortem

Klein (HBR, sept. 2007): se da el fracaso por hecho («pasó un año y la campaña fracasó») y cada uno escribe por qué; hace hablar al capataz que no lo diría en una reunión. Lo que salga —GPS sin fijar bajo dosel, placa ilegible, quién decide si un apoyo es retención cuando la foto no basta— define los campos del formulario antes de rediseñarlo a mitad de campaña. ⚠️ **El «30 % más de aciertos» que se cita de esa técnica NO está verificado en la fuente primaria (Mitchell, Russo, Pennington 1989; resumen retirado por el editor) y las descripciones del estudio lo matizan: no se cita como dato.**

### §8 · columna nueva en la tabla de verificación: «Nivel de validación 0-4 (NASA-STD-7009B)»

NASA-STD-7009B (aprobada 2024-03-05) exige entregar, junto al resultado de un cálculo, cuánto se puede confiar en él: factor VALIDACIÓN puntuado 0-4 sin crédito parcial — 4 = comparado contra mediciones del sistema real en su entorno, cubriendo todo el dominio de operación · 3 = contra mediciones en entorno representativo · 2 = contra un sistema representativo; y no se puntúa por encima de 1 sin validación conceptual previa. Requisitos [M&S 34/35/50]: el nivel VIAJA con el resultado al decisor. Aplicado a §8: geodesia (constantes WGS84 + 25 vanos del HTML) y resistencia (tabla de fabricante, 1,3 %) tienen referente externo; cambio de estado y vano peso tienen verificación interna independiente pero **ningún caso resuelto de norma**. El nivel exacto de cada fila lo asigna el Ingeniero con la definición literal; la pantalla lo muestra al lado del número, no un check verde. **Niveles 0 y 1: definiciones NO leídas verbatim — NO VERIFICADO.**

Fuentes: Hashim et al. 2019, DOI 10.3390/resources8020080 — https://www.mdpi.com/2079-9276/8/2/80 · CAIB Report Vol. I cap. 8 (2003) — https://govinfo.library.unt.edu/caib/news/report/pdf/vol1/chapters/chapter8.pdf · U.S.-Canada Power System Outage Task Force, Final Report (abr. 2004) — https://www.energy.gov/sites/prod/files/oeprod/DocumentsandMedia/BlackoutFinal-Web.pdf · Klein, HBR sept. 2007 (de pago; página oficial verificada) — https://hbr.org/2007/09/performing-a-project-premortem · NASA-STD-7009B — https://standards.nasa.gov/sites/default/files/standards/NASA/B/1/NASA-STD-7009B-Final-3-5-2024.pdf . Consultados 2026-09-02.

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

> **IEC 60826 separa tres cosas** (glosario 3.1.17-3.1.18 de la edición 2003; vigente 2017): **fiabilidad** = que el apoyo aguante su carga (probabilista, periodos de retorno) · **seguridad estructural** = «la capacidad de un sistema de estar protegido de un colapso mayor (efecto cascada) si se dispara un fallo en un componente dado» — y la nota: «la seguridad es un concepto DETERMINISTA, a diferencia de la fiabilidad» · **seguridad de personas** = cargas de construcción y mantenimiento (§6.5; §6.6 cargas de contención; Tabla 9 medidas adicionales). Todo lo verificado en este lóbulo responde a la PRIMERA. La segunda ya tiene barrera en el RCA (`contencion_falla`, `99 §ADR-026`: «¿por qué cayeron seis apoyos y no uno?») pero **no tiene campo en la ficha**: `p_func` ya dice suspensión/retención, lo que falta es **si existe medida de contención de cascada por tramo** — y la declaración de que ningún apoyo tiene retenida (`§8.3`) ya contesta media pregunta. Con eso se prioriza la inspección de corrosión de base en los tramos donde el fallo se propaga, no en los 26 por igual. ⚠️ **Tabla 1 (niveles de fiabilidad) y Tabla 9 NO leídas — NO VERIFICADO**; si se usan niveles de fiabilidad hay que consultar la 60826:2017 (`31 · L-78`). Tampoco se comprobó si RETIE/CREG remiten a IEC 60826 para 66 kV.
>
> Fuente: IEC 60826:2003, vista previa oficial (glosario e índice) — https://cdn.standards.iteh.ai/samples/5765/39269d6f9f3f40348a0691a78f3403ac/IEC-60826-2003.pdf · consultado 2026-09-02.

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

---

## §11 — Corrosión: de «ambiente salino» a un número con unidad, fecha y fuente

**ISO 9223:2012** clasifica la corrosividad atmosférica en C1 (muy baja) … C5 (muy alta) y **CX (extrema)**; su Nota 5 dice que CX «se refiere a ambientes marinos y marino/industriales específicos». Tabla 2, velocidad de corrosión del **primer año** (leída en la vista previa oficial de iTeh; la norma completa es de pago, `31 · L-78`):

| Categoría | Zinc (galvanizado) µm/año | Aluminio g/(m²·año) | Acero al carbono µm/año |
|---|---|---|---|
| C3 | 0,7 – 2,1 | 0,6 – 2 | — |
| C4 | 2,1 – 4,2 | 2 – 5 | 50 – 80 |
| C5 | **4,2 – 8,4** | **5 – 10** | 80 – 200 |
| CX | 8,4 – 25 | > 10 | 200 – 700 |

**Qué significa para el herraje:** el tiempo hasta el primer mantenimiento del galvanizado ≈ espesor ÷ tasa. Con el mínimo típico de galvanizado en caliente sobre acero estructural (**100 µm, dato de la AGA, NO de LN-627**) sale **12-24 años en C5** contra 47-143 en C3 tierra adentro: un factor de 4 a 12 sobre cualquier plan de inspección pensado tierra adentro. Las tasas del primer año NO se extrapolan linealmente (ISO 9224).

**Qué significa para el conductor de aluminio:** la Nota 4 avisa que el aluminio sufre corrosión uniforme Y localizada, y que «la profundidad máxima de picadura o el número de picaduras puede ser mejor indicador del daño» que la velocidad uniforme. **Se busca picadura, no adelgazamiento**: es lo que la cuadrilla fotografía de cerca, y el campo `picaduraMax_mm` de `§6.1`.

**La ecuación que evita el ensayo (cláusula 8, ec. 4, aluminio):**
`r_corr = 0,0042·Pd^0,73·exp(0,025·RH + f_Al) + 0,0018·Sd^0,60·exp(0,020·RH + 0,094·T)`, con T = temperatura media anual (°C), RH = humedad relativa media (%), Pd = deposición de SO₂ y **Sd = deposición de cloruros**, ambas en mg/(m²·día); `f_Al = 0,043·(T−10)` para T > 10 °C. T y RH ya los maneja el atlas; **el único dato nuevo es Sd**, con captador de vela húmeda barato o IDEAM.

**Cómo se decide la categoría de LN-627 (y NO se supone):** probetas patrón de zinc y acero (ISO 9226) en dos o tres apoyos —el más cercano al mar y el más interior— durante un año, o la ecuación con Sd medido. Que sea costera hace probable C5, pero **C5 es hipótesis razonada, no medición**; y CX no se descarta. De la categoría salen dos decisiones de plata: la frecuencia de inspección de herrajes/tornillería/grapas y la especificación de galvanizado de los repuestos.

**Cuánto dura esto (segunda mano, con la advertencia que le aplica):** el estudio de la CNE de Chile (ATS Energía, abr. 2018), citando la **Resolución CREG 011 del 11-02-2009**, Anexo General cap. 3: «km de línea 1 o 2 circuitos = **40 años**» (vida útil REGULATORIA, para remunerar, no técnica); en Colombia se observan 40-45 y hasta 55 años, «verificando que las vidas útiles inferiores corresponden a equipos sin repuestos o **aquellos que operan en condiciones de alta salinidad** o contaminación industrial». Propuesta del mismo estudio: estructuras y sujeción 50 años, **conductores y guarda 45**. El conductor es el eslabón corto; la sal justifica salirse del promedio. ⚠️ **Fuente primaria (la Resolución CREG 011/2009) NO abierta; vigencia NO confirmada** — abrirla antes de citarla en un entregable.

⚠️ **Lo que circula y NO entra:** «picadura de 0,5 mm a 20 años a menos de 500 m del rompiente», «vida 30-45 años en costa», «ciclos de inspección de 8-12 años»: blogs comerciales, sin revisión. Basura según su doctrina.

Fuentes: ISO 9223:2012, vista previa oficial (Tablas 1-2, Notas 4-5, cláusula 8) — https://cdn.standards.iteh.ai/samples/53499/e1f1aefb0a5446ac8308e3ddfce1db8b/ISO-9223-2012.pdf · American Galvanizers Association, «HDG Corrosion Rates for ISO Categories C1-C5/X», 02-12-2021 (secundaria; sus tasas de zinc coinciden con la Tabla 2) — https://galvanizeit.org/knowledgebase/article/hdg-corrosion-rates-for-iso-categories-c1-c5-x · CNE Chile / ATS Energía, «Vida útil de elementos de transmisión», abr. 2018, Tabla 5 — https://www.cne.cl/wp-content/uploads/2018/04/informe-vida-util-ATS.pdf . Consultados 2026-09-02.
