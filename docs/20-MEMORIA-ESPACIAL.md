# 🗺️ 20 — MEMORIA ESPACIAL (dónde vive cada cosa)

> **No se auto-carga.** Se consulta ante desorientación (trigger 🟡 de `CLAUDE.md §G.2`).
> **Regla de frescura:** si mueves, creas, renombras o eliminas algo, actualizas este nodo en el
> MISMO cambio. Un mapa desactualizado es peor que no tener mapa.

---

## §1 — El ecosistema: dónde encaja este repo

```
~/Desktop/GitHub-MJ/                     ← paraguas (no es un repo)
├── brain-private/                       🔐 bóveda LOCAL, nunca pública
│   ├── kernel/                          🔑 kernel canónico — escritor único
│   └── mantenimiento-lineas-at/         ← la carpeta de ESTE proyecto en la bóveda
│       ├── NOTAS-OPERATIVAS.md          🔑 credenciales, llave admin, USUARIOS Y ROLES. Todo dato
│       │                                personal o de acceso vive AQUÍ, nunca en el repo público
│       ├── research-archive/            crudos de deliberación (comités, workflows, consejo
│       │                                externo). Su README.md es el índice ÚNICO
│       ├── datos-campo/                 lo que el Ingeniero DIJO o midió en campo. Dato real: se
│       │                                cita desde el ADR, nunca se copia. NO entra en el índice de
│       │                                research-archive
│       ├── entregables/                 mazos e informes ya entregados
│       ├── fixtures/                    datos reales de cliente que usan las pruebas
│       └── fotos/                        material de campo (207 archivos, ya versionados)
├── powertransformersmj.github.io/       proyecto hermano (SGM · TRANSPOWER)
└── mantenimiento-lineas-at/             ← ESTE repo
```

**Por qué importa la posición:** el repo debe ser **hermano** de `brain-private/`, o `brain:pull` y
el `archiveDir` se rompen. Moverlo sin la bóveda **no da error**: el linter degrada a `info` y sigue
diciendo "SANO". Se mueven juntos, siempre.

---

## §2 — Mapa del repositorio

```
mantenimiento-lineas-at/
├── CLAUDE.md                    tronco encefálico (auto-cargado)
├── README.md                    puerta de entrada humana
├── package.json                 los 5 comandos del cerebro + test
│
├── nucleo/                      ⭐ EL ACTIVO: cálculo de ingeniería, funciones PURAS
│   ├── geodesia.js              Vincenty, azimuts, deflexiones, progresivas, vano viento, VIR
│   ├── mecanica.js              catenaria, parábola, viento, cambio de estado, tramos, vano peso
│   ├── termica.js               resistencia c.c., ampacidad IEEE 738, derrateo
│   ├── estadisticas.js          distribución de vanos (media, mediana, desv. de muestra…)
│   ├── vanos.js                 detalle vano a vano + control catenaria vs parábola
│   ├── umbrales.js              los 8 indicadores con semáforo y FUENTE (ADR-009)
│   ├── cantidades.js            BOM geométrico; lo no capturable va a `avisos`
│   ├── coherencia.js            función declarada vs deflexión, fuga específica, tierra
│   ├── cargas.js                carga TRANSVERSAL y utilización del apoyo (ADR-011)
│   ├── longitudinal.js          carga LONGITUDINAL: el segundo eje del veredicto (ADR-017)
│   ├── rca.js                   método de causa raíz: espinas, porqués, árbol, hipótesis,
│   │                            y las 6 condiciones del cierre. NUNCA marca la causa (ADR-020)
│   └── clima.js                 sondeo meteorológico de un evento Y sus límites redactados
│
├── contratos/                   ⭐ WORKSPACE @lineas/contratos — los esquemas Zod que ambos lados
│                                obedecen. `comunes.ts` es el dueño de `VERSION_CONTRATO` (la cifra
│                                que la app pinta; el `package.json` del paquete NO manda) y lleva
│                                el registro de qué cambió en cada versión.
│                                activos · eventos · rca · ia · index
│
├── tests/                       una por subsistema, con el mismo nombre que él. Las de ORO:
│   │                            `nucleo.test.js` (la red de la migración) y `exportar.test.js`
│   │                            (GPX/KML/CSV contra la tabla del original). Conteo vivo → `05`.
│   └──                          Las de FRONTERA molde↔motor↔papel, que no se fían de un fixture:
│                                `campos-del-molde` · `umbral-tierra` · `tope-de-tiro` (`30 · L-68`).
│
├── docs/                        las neuronas. **Quién es cada una es del `00-INDICE.md`**: aquí no
│   └── .brain-manifest.json     se repite. Es la configuración del cerebro (topes, archiveDir,
│                                kernelFiles) y NO es una neurona
│
├── scripts/                     🔑 KERNEL — NO se edita aquí
│   ├── .kernel-version.json     sello de integridad (SÍ se commitea)
│   └── *.mjs                    brain-check, brain-diff, brain-index, session-handoff,
│                                boot-gate, brain-archive
│
├── exportar/                    ⭐ WORKSPACE @lineas/exportar, HERMANO de nucleo (ADR-005/006/007):
│                                levantamiento.js (LA derivación única) · gpx/kml/csv · calidad.js
│                                (observaciones calculadas) · procedencia.js · gms.js · version.js
│                                · mecanica.js y bom.js (CSV de cálculo) · informe.js (documento
│                                imprimible, autocontenido: cero JS y cero recursos externos)
├── importar/                    ⭐ WORKSPACE @lineas/importar (17-08, ADR-028) — el camino INVERSO
│                                de exportar/: gpx.js (leer lo que trae la cuadrilla) · identidad.js
│                                (BUSCA el id en el registro de semillas; NUNCA lo acuña) · punto.js
│                                (construye UN punto, jamás reconstruye los que ya están) · plan.js
│                                (el antes/después con el motor de siempre) · **decisiones.js**
│                                (ADR-029: lee lo que él YA FIRMÓ; solo devuelve valores con su
│                                fecha, y NUNCA `Object.keys` de la página — eso lo hace identidad.js
│                                y aquí convertiría una clave suelta en un punto suyo) · **evidencias.js**
│                                (ADR-031: la CADENA archivo → carpeta → canónico → apoyo, nunca por
│                                posición; UNA implementación, DOS lectores). CERO `node:`.
│                                ⚠️ `identidad.js` deriva el id de una FOTO (de su huella); el de un
│                                PUNTO sigue vetado y con guardián (ADR-028/031)
├── evidencias/                  🚪 EL PORTERO (Worker, ADR-010 + **ADR-031**): verifica la FIRMA del
│                                token. `GET` sirve, `PUT` acepta bajo diez cerrojos.
│                                🚫 **NO borra y NO lista, jamás** — con prueba que lo bloquea
├── herramientas/sol-caribe.mjs rehace el ATLAS SOLAR (ADR-045)
├── herramientas/teselas/        construir-raster.py — rehace las capas del mapa desde datos
│                             abiertos. ⚠️ ÚNICO Python del repo; no lo usan ni la app ni las pruebas
├── herramientas/                sembrar.mjs (línea + expediente) · subir-evidencias.mjs (fotos) ·
│                                ⚠️ usuarios.mjs — **la ÚNICA vía de alta de personas**: alta,
│                                contrasena, rol, baja, restituir, auditar. Rechaza a propósito
│                                recibir la contraseña por tubería o argumento (ADR-019)
│   ├── semillas-emitidas.json   📗 EL LIBRO DE IDENTIDAD (ADR-027): quién ES cada punto. Solo crece;
│   │                            una fila escrita NO SE TOCA JAMÁS — de ella cuelgan 99 fotos
│   ├── decisiones-firmadas.json 📘 EL LIBRO DE DECISIONES (ADR-029): qué DECIDIÓ él. Se apenda,
│   │                            manda la última fechada y **NO da identidad**. Generado
│   └── publicar-decisiones.mjs  lo genera con LISTA BLANCA de campos. Local, jamás en CI
├── firestore.rules              🔒 parte del CONTRATO, no configuración: RBAC por *claims* y un
│   firebase.json                catch-all que niega todo lo no declarado. **Se despliega por SU
│   firestore.indexes.json       canal**, no con el sitio (`31 · L-22`)
├── disenos/                     5 maquetas HTML de la carcasa; ganó `5-horizonte` (ADR-018).
│                                NO es código de la aplicación
├── web/src/estilo.css           el tablero de color: ~61 tokens en `:root`, paleta CLARA. Ningún
│                                color se escribe fuera de ahí — lo vigila una prueba
├── web/src/componentes/         React SOLO pinta (ADR-005): Linea (las pestañas ARIA —cuántas son,
│                                en `05`— **y** la carcasa de 3 columnas), **RedDeSeguridad** (la red
│                                que evita la página en blanco de TODA la aplicación; se monta en
│                                `web/src/main.tsx`), **SolCaribe** (el atlas del Caribe, ADR-045:
│                                no es pestaña, es PANTALLA, y no cuelga de ninguna línea),
│                                Horizonte (los apoyos en su orden real),
│                                Mapa (popup completo + tramos + marcador de falla), Distribucion,
│                                Distancias, DetalleGps (el mapa a pantalla: MISMO Mapa con
│                                `panelALado`, ADR-042), Fichas (+FichaEditor · FichaLote, admin,
│                                ADR-038), FichaCriterios, Falla + Galeria, Fundamentos,
│                                Umbrales, Termica, Viento, Cargas (los DOS ejes, ADR-011/017),
│                                Cantidades, Exportar, Sello, Estado · **Cargar** (solo admin) y
│                                **Fotos** (ADR-031; cuadrilla o superior): las DOS que ESCRIBEN, y
│                                las dos cuyo efecto no se deshace · **Rca + RcaEditores: NO son
│                                pestaña de línea, son segmento hermano del parque → `99 §ADR-020`**
├── web/src/contenido/           doctrina SIN datos de cliente (fundamentos.ts: 9 tarjetas + normas)
├── web/src/exportar/            SOLO descargar.js (Blob/DOM) — el resto vive en el workspace
├── web/src/vistas/              ⭐ DUEÑOS ÚNICOS — si un número sale de aquí, NO se recalcula en
│   │                            ninguna pantalla (`99 §ADR-018`):
│   ├── ejesLinea.ts             los DOS ejes de carga de una línea
│   ├── vanosLinea.ts            la numeración CORRIDA de vanos (dibujo y tabla dicen lo mismo)
│   │                            (⚠️ colecciones de Firestore: `lineas` · `apoyos` · `hipotesis` ·
│   │                            `investigaciones` · `evidencias` · `analisis` · `acciones_capa` ·
│   │                            `sondeos_clima`. Las acciones CAPA van APARTE del análisis a
│   │                            propósito → `99 §ADR-020`)
│   ├── fichaLote.ts             quién puede recibir un dato de catálogo (ADR-038)
│   ├── cableGuarda.ts           los tramos SIN cable de guarda, vano a vano (ADR-044). El hueco
│   │                            significa NO CONSTA, jamás «lo lleva»
│   ├── solCaribe.ts             el cuadro de una hora del atlas solar (ADR-045)
│   ├── radiacion.ts             el recurso solar del corredor (ADR-037/046): rampa ajustada al
│   │                            recorte y su aviso de escala, que va SIEMPRE
│   ├── temperatura.ts           la temperatura del AIRE del mapa (ADR-039): media, no extremo
│   ├── coberturaEjes.ts         qué se sabe de CADA apoyo, eje por eje: los 4 estados (ambos · solo
│   │                            transversal · solo longitudinal · ninguno) y los textos del
│   │                            horizonte. Lo piden `estadoLinea` y `Horizonte`
│   ├── estadoLinea.ts           el CIELO de la línea (amanecer/atardecer/tormenta/niebla). Pide el
│   │                            cruce a `coberturaEjes.ts`: NO lo reimplementa
│   └── fotosNuevas.ts           (ADR-031) cifras y frases de Fotos, con el «106 entrarían nuevas»
│                                que él lee ANTES de firmar
│                                De dónde salió cada uno → `99 §ADR-018`.
│                                El resto: formato (nf + textoNucleo: coma decimal en la prosa del
│                                núcleo, L-26) + tramoColores + diagramas.ts (las 9 figuras de
│                                Fundamentos) + termicaDatos / vientoDatos / criteriosApoyo (pide el
│                                tope de tierra al núcleo, ADR-052) / cargasDatos / longitudinalDatos
│                                / planta / tramos.
│                                ⚠️ Una vista PROBADA que importe a OTRA lleva `.ts` explícito, o
│                                `node --test` no resuelve.
├── web/src/datos/               repositorio · enlace (useSyncExternalStore, y el dueño de la RUTA
│                                junto a ruta.ts) · firebase · firestore · cargar (LA única frontera
│                                de carga diferida, con reintentos) · teselas.ts (prepara un PMTiles
│                                sin fundir el trozo del mapa con el de entrada) · clima.ts (IDEAM
│                                desde el navegador, y solo si él lo pide) · **registroSemillas.ts**
│                                y **registroDecisiones.ts** (ADR-027/029: la app LEE, no escribe)
│                                · **fotos.ts** (ADR-031: primero el OBJETO, después la FICHA)
│                                · **pronostico.ts** (ADR-035: la ÚNICA pieza del mapa que pide
│                                internet, y NO guarda nada)
├── web/public/mapas/            Callejero y satelital: PMTiles del MISMO bbox (ADR-034). Las capas
│                             de MEDIDA (radiación, temperatura) no son imagen: un PNG de valores
│                             por mes + su ficha (ADR-036/037). Mecánica en `vistas/rejilla.ts`
│                             ⚠️ DOS recortes que NO se mezclan: `cartagena*` el corredor y
│                             `caribe*`+`sol-caribe*` los 7 dptos (ADR-045), perezosos
├── web/public/basemaps-assets/  fuentes y sprites del mapa (autohospedados)
├── githooks/pre-commit          BLOQUEA el commit: coordenadas reales y cerebro roto
├── .claude/settings.json        hooks de sesión (SÍ se commitea; el resto de .claude/ no)
├── .github/workflows/ci.yml     integridad del kernel + suite de pruebas
└── …/vigia-nasa.yml             atlas al día cada 2 meses. PROPONE. ⚠️ inerte: TODO-75
```

---

## §3 — Fronteras que no se cruzan

| Frontera | Regla |
|---|---|
| `nucleo/` ↔ resto | `nucleo/` **no importa nada**: ni DOM, ni red, ni base, ni configuración. Entran números, salen números — por eso es probable y portable. |
| `scripts/*.mjs` | Kernel canónico. Editarlo aquí dispara el gate #0 *"fork prohibido"* y bloquea el commit: se edita en `../brain-private/kernel/`, se bumpea `VERSION` y se reparte con `brain:pull`. |
| Molde ↔ motor | Un campo que el motor lee de la hipótesis y el molde no admite es una rama INALCANZABLE: `validar()` lo tira en silencio. Lo vigila `tests/campos-del-molde.test.js` (`ADR-052`). |
| Repo ↔ bóveda | Coordenadas reales, fotos de campo, informes y el HTML original **nunca** cruzan al repo: es **público**. |
| `docs/` ↔ `CLAUDE.md` | `CLAUDE.md` es router, no bitácora: ni historial ni tareas (`§G.3`). |

---

## §4 — Dónde empieza cada cosa

| Quiero… | Empiezo en… |
|---|---|
| entender una fórmula | `docs/40`, luego el módulo de `nucleo/` |
| por qué una prueba espera ese número | `docs/40 §8` (tabla de verificación) |
| añadir un cálculo nuevo | `nucleo/` + prueba en `tests/` en el MISMO cambio |
| ajustar topes de contexto de las neuronas | `docs/.brain-manifest.json` → `caps` |

---

## §5 — Origen de los datos

El módulo de campo original (`LN-627_Modulo_Campo_10.html`, 30 MB) **no vive en el repo**: de él se
portó `nucleo/` y de él salen los fixtures de la bóveda. Su inventario → `docs/40` y `33 · L-05`.
