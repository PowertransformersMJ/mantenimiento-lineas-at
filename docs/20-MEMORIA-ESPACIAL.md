# 🗺️ 20 — MEMORIA ESPACIAL (dónde vive cada cosa)

> **No se auto-carga.** Se consulta ante desorientación (trigger 🟡 de `CLAUDE.md §G.2`): *"¿dónde
> está este módulo / esta función / este flujo?"*.
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
│       ├── fixtures/                    datos reales de cliente que usan las pruebas
│       └── fotos/                        material de campo
├── powertransformersmj.github.io/       proyecto hermano (SGM · TRANSPOWER)
└── mantenimiento-lineas-at/             ← ESTE repo
```

**Por qué importa la posición:** el repo debe ser **hermano** de `brain-private/`. Si no, la ruta
`../brain-private` no resuelve y `npm run brain:pull` y el `archiveDir` del manifiesto se rompen.
Mover el repo sin mover la bóveda **no da error** — el linter degrada a `info` y sigue diciendo
"SANO". Se mueven juntos, siempre.

---

## §2 — Mapa del repositorio

```
mantenimiento-lineas-at/
├── CLAUDE.md                    tronco encefálico (auto-cargado)
├── README.md                    puerta de entrada para humanos
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
│                                que la app pinta; `package.json` de ese paquete NO manda).
│                                activos · eventos · rca · ia · index
│
├── tests/
│   ├── nucleo.test.js           pruebas de oro del núcleo — la red de seguridad de la migración
│   ├── exportar.test.js         GPX/KML/CSV contra la tabla del módulo original (golden, ADR-006)
│   ├── estilo-tokens.test.js    5 guardias del tablero de color: ninguna variable sin declarar,
│   │                            ningún color quemado fuera de `:root`, ningún `tono` inexistente
│   ├── estado-linea.test.js     el «cielo»: `amanecer` es INALCANZABLE si falta un dictamen
│   ├── rca.test.js              el método de causa raíz (27) — incluye el tope climático
│   └── + estadisticas · vanos · umbrales · cantidades · coherencia · cargas · cargas-vista ·
│       longitudinal · diagramas · formato · termica-vista · viento · exportar-calculo · informe ·
│       criterios-apoyo · portero · contrato-evidencia   (el conteo vivo lo da `05`, no este mapa)
│
├── docs/                        las neuronas (índice en 00-INDICE.md)
│   ├── .brain-manifest.json     configuración del cerebro: topes, archiveDir, kernelFiles
│   ├── 00-INDICE.md             enrutamiento síntoma → neurona
│   ├── 05-ESTADO-GLOBAL.md      signos vitales (auto-cargado)
│   ├── 10-MEMORIA-CORTO-PLAZO.md pizarra del WIP (auto-cargado)
│   ├── 20-MEMORIA-ESPACIAL.md   este archivo
│   ├── 30-LECCIONES.md          MADRE: índice de TODOS los L-NN + las de método
│   ├── 31-LECCIONES-PROVEEDORES.md  ↳ factura, licencia o SDK de un tercero
│   ├── 32-LECCIONES-PANTALLA.md     ↳ lo que se ve o se abre ≠ lo que el núcleo produjo
│   ├── 33-LECCIONES-NUCLEO-Y-DATO.md ↳ el número que se firma · el dato que no sale
│   ├── 40-DOMINIO-LINEAS-AT.md  ingeniería de líneas AT
│   └── 99-HISTORIAL-ADR.md      por qué se decidió cada cosa
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
├── evidencias/                  🚪 EL PORTERO (Cloudflare Worker, ADR-010): verifica la FIRMA del
│                                token de Firebase contra las llaves de Google y sirve las fotos
│                                del depósito privado. No escribe, no borra, no lista.
├── herramientas/                sembrar.mjs (línea + expediente) · subir-evidencias.mjs (fotos) ·
│                                ⚠️ usuarios.mjs — **la ÚNICA vía de alta de personas**: alta,
│                                contrasena, rol, baja, restituir, auditar. Rechaza a propósito
│                                recibir la contraseña por tubería o argumento (ADR-019)
├── firestore.rules              🔒 parte del CONTRATO, no configuración: RBAC por *claims* y un
│   firebase.json                catch-all que niega todo lo no declarado. **Se despliega por SU
│   firestore.indexes.json       canal**, no con el sitio (`31 · L-22`)
├── disenos/                     5 maquetas HTML autocontenidas de la carcasa. Ganó `5-horizonte`
│                                y ya está implementada (ADR-018). NO es código de la aplicación
├── web/src/estilo.css           el tablero de color: ~61 tokens en `:root`, paleta CLARA desde el
│                                04-08. Ningún color se escribe fuera de ahí — lo vigila una prueba
├── web/src/componentes/         React SOLO pinta (ADR-005): Linea (las 11 pestañas ARIA **y** la
│                                carcasa de 3 columnas), Horizonte (los apoyos en su orden real),
│                                Mapa (popup completo + tramos + marcador de falla), Distribucion,
│                                Distancias, Fichas, FichaCriterios, Falla + Galeria, Fundamentos,
│                                Umbrales, Termica, Viento, Cargas (los DOS ejes, ADR-011/017),
│                                Cantidades, Exportar, Sello, Estado · **Rca + RcaEditores: NO son
│                                una pestaña de línea — son un segmento hermano del parque, porque
│                                un análisis puede abarcar varias líneas (ADR-020)**
├── web/src/contenido/           doctrina SIN datos de cliente (fundamentos.ts: 9 tarjetas + normas)
├── web/src/exportar/            SOLO descargar.js (Blob/DOM) — el resto vive en el workspace
├── web/src/vistas/              ⭐ DUEÑOS ÚNICOS — si un número sale de aquí, NO se recalcula en
│   │                            ninguna pantalla (`99 §ADR-018`):
│   ├── ejesLinea.ts             los DOS ejes de carga de una línea
│   ├── vanosLinea.ts            la numeración CORRIDA de vanos (dibujo y tabla dicen lo mismo)
│   │                            (⚠️ colecciones de Firestore: `lineas` · `apoyos` · `hipotesis` ·
│   │                            `investigaciones` · `evidencias` · `analisis` · `acciones_capa` ·
│   │                            `sondeos_clima`. Las acciones CAPA van APARTE del análisis a
│   │                            propósito: dentro de un array las reglas no distinguen «cerrar una
│   │                            acción» de «reescribir el razonamiento tras firmar»)
│   ├── coberturaEjes.ts         qué se sabe de CADA apoyo, eje por eje: los 4 estados
│   │                            (ambos · solo transversal · solo longitudinal · ninguno) y los
│   │                            textos del horizonte. Lo piden `estadoLinea` y `Horizonte`
│   └── estadoLinea.ts           el CIELO de la línea (amanecer/atardecer/tormenta/niebla). Pide el
│                                cruce a `coberturaEjes.ts`: NO lo reimplementa
│                                De dónde salió cada uno, porque duplicarlos es reabrir un fallo ya
│                                pagado: `ejesLinea` de `Cargas.tsx` · `vanosLinea` de `DetalleVanos`
│                                (para que dibujo y tabla no discrepen) · `coberturaEjes` de
│                                `Horizonte.tsx`, donde el cruce estaba MAL —pintaba hueco sin
│                                distinguir a qué eje le faltaba el dato (`TODO-53`)—.
│                                El resto: formato (nf + textoNucleo: coma decimal en la prosa del
│                                núcleo, L-26) + tramoColores + diagramas.ts (las 9 figuras de
│                                Fundamentos) + termicaDatos / vientoDatos / criteriosApoyo /
│                                cargasDatos / longitudinalDatos / planta / tramos.
│                                ⚠️ Las vistas que se PRUEBAN no
│                                pueden importar `./planta` ni `./tramos` en ejecución: arrastran
│                                `@lineas/contratos` (TypeScript sin compilar) y `node --test` no
│                                lo resuelve. Solo `@lineas/nucleo/*` y tipos. Y si una vista
│                                probada importa a OTRA vista, el import lleva `.ts` explícito
│                                (`allowImportingTsExtensions` en `web/tsconfig.json`): sin la
│                                extensión, `node --test` no resuelve y la prueba revienta.
├── web/src/datos/               repositorio · enlace (useSyncExternalStore) · firebase (ingreso:
│                                correo+contraseña y Google de reserva) · firestore · cargar
│                                (reintentos) · clima.ts (IDEAM **desde el navegador**, porque el
│                                proyecto no tiene cómputo servidor que no facture; y SOLO cuando el
│                                Ingeniero lo pide, nunca al pintar)
├── web/public/mapas/            recorte PMTiles metropolitano (4,3 MB, autohospedado)
├── web/public/basemaps-assets/  fuentes y sprites del mapa (autohospedados)
├── githooks/pre-commit          corre los gates y BLOQUEA el commit si el cerebro está mal
├── .claude/settings.json        hooks de sesión (SÍ se commitea; el resto de .claude/ no)
└── .github/workflows/ci.yml     integridad del kernel + suite de pruebas
```

---

## §3 — Fronteras que no se cruzan

| Frontera | Regla |
|---|---|
| `nucleo/` ↔ resto | `nucleo/` **no importa nada**: ni DOM, ni red, ni base de datos, ni configuración. Entran números, salen números. Es lo que lo hace probable y portable. |
| `scripts/*.mjs` | Kernel canónico. Editarlo aquí dispara el gate #0 *"fork prohibido"* y bloquea el commit. Se edita en `../brain-private/kernel/`, se bumpea `VERSION` y se reparte con `npm run brain:pull`. |
| Repo ↔ bóveda | Coordenadas GPS reales, fotos de campo, informes de cliente y el HTML original **nunca** cruzan al repo. El repo es **público**. |
| `docs/` ↔ `CLAUDE.md` | `CLAUDE.md` es router, no bitácora: jamás se documenta historial ni tareas ahí (`§G.3`). |

---

## §4 — Dónde empieza cada cosa

| Quiero… | Empiezo en… |
|---|---|
| entender una fórmula | `docs/40-DOMINIO-LINEAS-AT.md`, luego el módulo de `nucleo/` |
| saber por qué una prueba espera ese número | `docs/40 §8` (tabla de verificación) |
| añadir un cálculo nuevo | `nucleo/` + prueba en `tests/` en el MISMO cambio |
| cambiar el comportamiento del cerebro | `../brain-private/kernel/` (no aquí) |
| ajustar topes de contexto de las neuronas | `docs/.brain-manifest.json` → `caps` |
| ver el estado real del despliegue | `git fetch` primero — los refs locales mienten (`§3.3`) |

---

## §5 — Origen de los datos

El módulo de campo original (`LN-627_Modulo_Campo_10.html`, 30 MB) **no vive en el repo**. Es la
fuente de la que se portó `nucleo/` y de la que salen los fixtures de la bóveda. Su inventario
—qué contenía y qué se extrajo de él— está en `docs/40-DOMINIO-LINEAS-AT.md` y en
`docs/33-LECCIONES-NUCLEO-Y-DATO.md · L-05`.
