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
│       ├── research-archive/            crudos de deliberación (comités, consejo externo)
│       └── fixtures/                    datos reales de cliente que usan las pruebas
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
│   └── cargas.js                carga transversal y utilización del apoyo (sin vista aún)
│
├── tests/
│   ├── nucleo.test.js           pruebas de oro del núcleo — la red de seguridad de la migración
│   ├── estadisticas.test.js     estadísticas de vanos contra el panel original
│   ├── exportar.test.js         GPX/KML/CSV contra la tabla del módulo original (golden, ADR-006)
│   └── vanos · umbrales · cantidades · coherencia · cargas · diagramas · termica-vista ·
│       viento · exportar-calculo · informe · criterios-apoyo   (445 pruebas en total)
│
├── docs/                        las neuronas (índice en 00-INDICE.md)
│   ├── .brain-manifest.json     configuración del cerebro: topes, archiveDir, kernelFiles
│   ├── 00-INDICE.md             enrutamiento síntoma → neurona
│   ├── 05-ESTADO-GLOBAL.md      signos vitales (auto-cargado)
│   ├── 10-MEMORIA-CORTO-PLAZO.md pizarra del WIP (auto-cargado)
│   ├── 20-MEMORIA-ESPACIAL.md   este archivo
│   ├── 30-LECCIONES.md          MADRE: índice de los 33 L-NN + las de método
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
├── herramientas/                sembrar.mjs (línea + expediente) · subir-evidencias.mjs (fotos)
├── web/src/componentes/         React SOLO pinta (ADR-005): Linea (11 pestañas ARIA), Mapa (popup
│                                completo + tramos + marcador de falla), Distribucion, Distancias,
│                                Fichas, Falla + Galeria, Fundamentos, Umbrales, Termica, Viento,
│                                Cargas (carga sobre el apoyo, ADR-011), Cantidades, Exportar,
│                                Sello, Estado
├── web/src/contenido/           doctrina SIN datos de cliente (fundamentos.ts: 9 tarjetas + normas)
├── web/src/exportar/            SOLO descargar.js (Blob/DOM) — el resto vive en el workspace
├── web/src/vistas/              geometría para pintar + formato (nf + textoNucleo: coma decimal en
│                                la prosa del núcleo, L-26) + tramoColores + diagramas.ts (las 9
│                                figuras de Fundamentos) + termicaDatos / vientoDatos /
│                                criteriosApoyo / cargasDatos. ⚠️ Las vistas que se PRUEBAN no
│                                pueden importar `./planta` ni `./tramos` en ejecución: arrastran
│                                `@lineas/contratos` (TypeScript sin compilar) y `node --test` no
│                                lo resuelve. Solo `@lineas/nucleo/*` y tipos.
├── web/src/datos/               repositorio, enlace (useSyncExternalStore), firebase, cargar (reintentos)
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
