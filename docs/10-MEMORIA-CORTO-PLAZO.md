# 📝 10 — MEMORIA DE CORTO PLAZO (pizarra viva)

> Se **AUTO-CARGA**. Pizarra, no bitácora (§G.3). Este nodo ES el relevo: léelo entero.
> ⚠️ `docs/.handoff-auto.md` es una FOTO FECHADA: manda solo si su fecha es MÁS NUEVA (`§ADR-102`).

## 🎯 Dónde estamos

**Cifras en `05`.** 15 pestañas + RCA + tres informes; las olas cerradas, en el `00`.
Todo EN PRODUCCIÓN y **verificado en vivo con su sesión**.

> 🧭 **SE VA POR FASES, orden suya (22-08).** El **módulo RCA sigue APARCADO** —lo cerrado ahí es
> `§ADR-049/050`—. La fase viva es **la página**: no eligió entre ② **se lee** y ③ **no se cae**.

## 🛑 LO PRIMERO AL RETOMAR
0. 🆕 **PARÁMETROS ELÉCTRICOS** (`§ADR-088..131`). El SCADA entra por los pasos 0·1·2 de `20`, ≤100
   archivos por carga.
   ✅ **ENERO-AGOSTO EN PRODUCCIÓN** (`§ADR-128`): **208 días** (máx 197 · prom 207 · inst 208 · mín
   195), **validados el 11-09** —las 8 señales hora a hora, del SCADA a la base, 29/29 grupos—; lo que
   falta no vino en la exportación (`TODO-101`); lo NO comparado, en su «Validación». Apartado
   hasta que decida: el 20-04 y un archivo de 2025 (`TODO-103`). Pico del máximo **588 A el 05-08 =
   82 %**, con forma de EVENTO; la sostenida más alta, **490 A de promedio el 22-07**. 📊 Filtro
   por gráfica, sin tablas, eje día a día y un día abre sus 24 h en todas (`§ADR-129..131`).
   ⚠️ Sin capacidad nominal no hay porcentaje; en **P y Q, negativas, el «max» es el de MENOS carga**.
   ⚠️ Falta lo SUYO: ratificar los **718 A** (`TODO-95/93`).
1. **EL CUELLO DE BOTELLA NO ES CÓDIGO: ES EL DATO**: 0 de 26 con veredicto (`TODO-57`).
2. **EL PATRÓN QUE LO DOMINA TODO:** *«arreglado donde se veía, vivo en la pieza hermana»* (`34 · L-65/74`,
   `32 · L-67`, `30 · L-68/M-01`; mordió en `§ADR-078/087/098`). ⚠️ **ORDEN SUYA (24-08):** cambiar sin
   dañar lo que está bien, y actuar solo sobre lo que él indica o se DETECTA midiendo, **nunca sobre una suposición**.
3. **EL ATLAS: ONCE CAPAS EN 3 FAMILIAS + DOS FINAS DEL CORREDOR** (`§ADR-079/081/086/087`): 5 del
   año · 3 del satélite · 3 de pronóstico; retraso y reloj de cada una, en `20`. ⚠️ **CADA CAPA
   DECLARA QUÉ ES** (`medida` · `pronostico` · `promedio`), sin defecto, o no se publica
   (`§ADR-082/084`). ⚙️ El vigía FUSIONA SOLO, con portero (`§ADR-085`); publicar, a mano (`TODO-89`).
4. **LO QUE NO SE PUEDE ROMPER DEL CLIMA (`§ADR-057..086`):** gana el HECHO sobre el modelo · el recorrido se comprueba **punto a punto**, nunca por promedio · el clima vive en el ATLAS · **«tormenta eléctrica» NO existe en la fuente**.

## 🚫 INVARIANTES — índice; cada uno vive ENTERO en su ADR

· **Carcasa** `§ADR-018` — `amanecer` inalcanzable si falta un apoyo; el veredicto sale de `utilizacion_pct`, nunca de `cargaRotura_kgf`; dueños únicos en `vistas/`.
· **Puntos nuevos** `§ADR-027/054` — identidad por NOMBRE, anotada ANTES; se biseca y el origen entra con `mínimo − 1`: nunca se renumera.
· **RCA** `§ADR-020/026` — prohibido rankear hipótesis, causa raíz por IA y % de confianza; las causas las lee `causasDeclaradas()`.
· **Acceso** `§ADR-024` — la contraseña es HIGIENE, la frontera son las reglas. · **Fotos** `§ADR-031` — el portero NO borra ni lista.
· **Capas del mapa** `§ADR-034/046/086` — viajan CON el sitio; byte 0 = SIN DATO; **cada capa DECLARA si es medida o pronóstico** y el motor no publica sin eso; toda capa trae encuadre Y escala, las dos o ninguna.
· **Ficha y lote** `§ADR-030/038` — el lote rellena huecos, solo los 3 del MODELO. · **Recordar ≠ proponer** `§ADR-029` — sin decisión suya, campo VACÍO.
· **Verosimilitud** `§ADR-050` — la escala son TRES y se LEE del molde; una rival se cierra diciendo qué se hizo, no con etiqueta.
· **Señales de la página** `§ADR-051` — banda, pestaña y tope de tiro salen del DATO, con un solo dueño; la versión del motor la ata un gate de `pre-commit`.
· **El número que se firma** `§ADR-052` — un tope declarado manda en TODAS las piezas, y el molde tiene que admitirlo o la base lo tira en silencio.
· **Atlas** `§ADR-045/055/079/086` — UN motor y UN escritor de fichas para los ONCE. Viento, rayos y **ningún pronóstico** marcan hipótesis; en el mapa de la línea van como dato del SITIO.
· **Parámetros eléctricos** `§ADR-088/112/117/119` — **un hueco NO es un cero** y sin archivo, jamás cifras de muestra; el % del archivo no se pisa; el estadístico se supone solo al LEER, nunca al guardar; el máximo DICTA y no se sustituye; manda la fecha del DATO; se cuenta lo escrito contra lo leído; y se verifica abriendo EN FRÍO. **Pantalla nueva: MAQUETA con su dato y su «sí» ANTES** (`32 · L-88`).

## 🧭 Cómo retomar

1. **Abrir Claude Code DENTRO del proyecto** (desde el paraguas: `session-handoff.mjs --boot-echo`).
2. Desplegar: `git pull --rebase` → `npm run build` → `npm run deploy --workspace web` (`35 · L-35/77`). Repo
   PÚBLICO → **cero bytes de cliente**. Reglas: `firebase deploy --only firestore:rules`, ANTES (`35 · L-22`).
3. **Verificar contra PRODUCCIÓN con su Chrome**, no contra `dist/` (`32 · L-18/35`); el MAPA, con `herramientas/mirar-los-atlas.mjs`, que SUSPENDE si no hay dibujo — **nunca con
   tiempo virtual** (`34 · L-72`).
4. Antes de CADA push: `npm test` + `contrato:verificar` + `brain:check` (bloquea si el boot se pasa).

## 🔲 Pendientes del INGENIERO

| # | Qué | Por qué importa |
|---|---|---|
| **TODO-57** | **La FICHA está EN PRODUCCIÓN** (`§ADR-030`); falta **el DATO** de sus seis campos: ¿planos y actas, o levantarlo? | **EL CUELLO DE BOTELLA REAL.** Al meter el primero saldrán «REVISAR»: no son averías nuevas |
| **TODO-82/83** | **Clima.** ① ¿FASE 2 del pronóstico: franja y sensación térmica (`§ADR-057`)? ② ¿Dato FINO por extremos (`§ADR-064`)? ③ Satelital «con huecos»: falta DÓNDE | Sensación de **40 °C** con aire a 32,5 |
| **TODO-88** | **¿Se junta otra vez el eje del tiempo?** El pronóstico está en el atlas con mes, día y hora (`§ADR-086`) pero en su propia FAMILIA. ¿Lo quiere junto a lo medido en **una sola tira**? | Medido y modelo juntos hacían «ganar el hecho» |
| **TODO-80** | **¿Qué tope de puesta a tierra rige?** El campo existe (`ADR-052`); declararlo basta. Sin decisión suya siguen **10 Ω** | Con 18 Ω medidos, 10 Ω dice «revisar» y 25 Ω «cumple» |
| **TODO-90** | **La capa de rayos que piden las NORMAS** (rayos/km²/año, RETIE e IEEE 1243). Espera una **cuenta Earthdata gratuita** (`99 §ADR-079`) | La horaria dice CUÁNDO hubo tormenta; ésta entra en el cálculo de salidas |
| **TODO-89** ⬅️ **ORDEN SUYA** | **Encender el despliegue automático.** Faltan los dos secretos de Cloudflare, que no pasan por el chat (`§ADR-077`). ⚠️ Nadie mirará el mapa antes de publicar | Último eslabón de «cada 4 h» |
| **TODO-72** | **¿Autorización del IGAC?** Sus ortoimágenes cubren esto a **3 m** y **10 cm**, contra los 10 m de hoy (`§ADR-040`) | Única vía a más resolución |
| **TODO-71** | **¿Se cierran las hipótesis con dato real?** El **viento** (`ADR-035`) y los **1.000 W/m²**: los atlas los ACERCAN, no los cierran (`ADR-055`) | De ahí salen los tiros y la capacidad |
| **TODO-59** | **Qué ficha se le pide a CADA tipología.** La línea mezcla 4 y el molde es de POSTE (`40 §8.3`) | Son 3 o 4 formularios |
| **TODO-33** | **50 % o 25 % de RTS** como tope de tiro. Ya no hay dos dueños (`§ADR-051`): falta decidir CUÁL rige | Factor 2 sobre un dictamen |
| **TODO-98** 🔴 **MÍA** | **El recibo de la contraseña se auto-firma** desde la consola y **se salta el muro del cambio obligatorio** (y `ultimoAcceso`) | Un muro que se salta no es un muro |
| **TODO-95/93 · 101** 🔴 ⬅️ **SUYA, URGENTE** | Tres cosas, todas del mismo veredicto. ① **La FICHA del fabricante del conductor** y ② **ratificar la condición** de ampacidad (hoy ADOPTADA: 718 A); sin ellas se publica pero **NO SE FIRMA** (`§ADR-098/099`). ③ **`TODO-101`: re-exportar del SCADA** el **MÁXIMO del 3 al 12/01** (dicta el térmico) · el mínimo del 1 al 12/01 · el 01/02 (carpeta vacía) · el 12/08 (su «12Agosto» trae el 13) · mayo (`TODO-103`); el 30-31/01 no existe («30Enero» es el 29-jul: ⚠️ no borrarla) | 718 A hoy · **611 A** a 75 °C · y diez días de enero **sin pico** |
| **TODO-103** ⬅️ **SUYA** | **Lo apartado de ene-ago** (`§ADR-128`): ① el **20-04** 7-19 h, congelado «Not Renewed»: ¿fuera, sin esas horas o tal cual? ② re-bajar **MAYO** ③ el archivo de **2025** ④ ¿fallas o maniobras el 24-02, 20-06, 05-08, 29-08 y el 22-07 17 h? ⑤ ¿las horas contra la AMPACIDAD sustituyen a las del % del archivo? (`§ADR-129`) ⑥ ofrecido 11-09: validar lo DERIVADO y los resúmenes; el aviso «del 3 al 12/01 SÍ hay promedio e instantáneo» | Nada se carga sin su decisión |
| **TODO-104** ⬅️ **SUYA** | **LN-617/628** (`§ADR-132/133`): ✅ altas hechas el 20-09 · ① ¿E01-E06, E09, E24? ¿fuera del 618? ② función de cada torre ③ conductor e hipótesis ④ 185 h no «Actual» ⑤ 15 y 29 horas de evento | Sin ② no hay torres; sin ③ no hay veredicto |
| **TODO-100** 🔴 **MÍA** | El lector no abre los `.xls`: el paso 0 ya es herramienta; falta que lo haga la pantalla | Fallar oscuro se lee «dato malo» |
| **TODO-44/34** | Alerta de gasto en Cloudflare · **nada tiene copia**: la bóveda sin remoto **y Firestore sin punto de recuperación** (`§ADR-089`) | Un fallo de disco se lleva la bóveda; un comando, la base |
| **TODO-61/54/68** | ¿App Check? · ¿linter de frescura? · ¿cazar un ADR repetido o citado sin escribir? Las dos últimas, KERNEL | Las TRES son TUYAS |
| **TODO-76** | **¿Autosoportado o retenido?** No cabe en el modelo: iría por APOYO (26 declaraciones) | Cierra media incógnita de la capacidad longitudinal |
| **TODO-78/84** ⬆️⬆️ | **Cerebro LLENO** (`§ADR-065/083/102/125`): el ARRANQUE vive sin margen y **cada sesión poda texto bueno**. Shard o recalibrar | El freno más caro del día a día |

## 🔲 Pendientes de CLAUDE — en este orden

| # | Qué | Dónde está el plan |
|---|---|---|
| **TODO-105** 🔴 | **Torre común hecha y en producción** (`§ADR-133`): las dos líneas, de alta el 20-09. Falta cargar su SCADA | `§ADR-133` |
| **TODO-102** 🔴 | ① >100 archivos da un error crudo y el sello de calidad no se enseña (`§ADR-128`) · ② hermanas en el calendario pero sin ver con dato real (falta %); barras del Atlas, reglas viejas · ④ sondas 3·4·7 (`§ADR-121`) · ⑤ los ceros al final miran solo el día 1 · ⑥ conductor «fabricante» vs `supuesto`; `--tx-tenue` no existe; la guardia de color solo mira `estilo.css` · ⑦ «hoy» con dos dueños: `iso()` local y `diaDe` de Colombia · ⑧ `deploy` que se niegue con el remoto sin traer (`35 · L-77`) · ⑨ el arnés que DIBUJA, a `herramientas/` (`32 · L-90`), y el guardián que barra las gráficas (`§ADR-125`) | `99 §ADR-125..129` |
| **TODO-70** | **Cerrar la ola de la ficha.** Queda SOLO ③: el gesto «Confirmo este dato», que exige su propio molde | `99 §ADR-030/032/033/038` |
| **TODO-66** | **Que una acción pruebe que FUNCIONÓ**, no solo que se hizo: verificación posterior con fecha | `99 §ADR-026` |
| **TODO-79** | **Saldo del entorno: 34 vivos + 5 parciales** (`§ADR-049`); lo más caro: el id crudo en el **informe firmable** y la red del **mapa** | Varios son decisión suya |
| **TODO-52/49/48** | RCA: lienzo del árbol · contador de PARQUE · deuda 017 | `§ADR-017/018/020` |
| **TODO-30/11 · 13-23** | XSD de GPX/KML en CI · nota técnica de LN-627 · F3-F5 | `ADR-014` |

## ✅ Consolidado — el detalle vive en su dueño

La línea → `40 §10` · las 205 fotos → `§ADR-031` · IDEAM (sin rayos) → `35 · L-37` · y el que más
se repite: **«verde no prueba nada»** (`30 · L-33/56`).
