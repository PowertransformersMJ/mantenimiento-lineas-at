# ⚡ Mantenimiento Líneas AT

Plataforma de gestión del mantenimiento de **líneas de alta tensión** — inventario de líneas y
apoyos, inspecciones de campo, hallazgos, cálculo mecánico y eléctrico, registro fotográfico
georreferenciado e informes.

**Caribe colombiano.** Responsable: Miguel A. Jiménez G.

---

## De dónde viene

El punto de partida es un módulo de campo de una sola línea (LN-627): un archivo HTML autocontenido
de 30 MB que ya resolvía lo difícil —el cálculo de ingeniería— pero no escalaba más allá de esa línea.

| | Módulo de campo LN-627 | Este sistema |
|---|---|---|
| Alcance | una línea, un archivo | muchas líneas, histórico entre inspecciones |
| Fotos | 99 imágenes en base64 dentro del HTML | almacenamiento de objetos, servidas bajo demanda |
| Distribución | se envía el archivo por correo | aplicación web con roles y trazabilidad |
| Cálculo | 115 funciones mezcladas con el DOM | núcleo puro, probado y reutilizable |
| Datos y cálculo en campo | funcionan sin señal | siguen funcionando, y además sincronizan |
| **Mapa en campo** | **se cae sin señal** (pide teselas a internet) | mapa vectorial descargado, offline por diseño |
| Vano peso | se escribe a mano | se deriva de la geometría, y **detecta arrancamiento** |

Lo que **no** cambia: el criterio de ingeniería. Las fórmulas se portaron una a una y están
verificadas contra el original. Ver [`docs/40-DOMINIO-LINEAS-AT.md`](docs/40-DOMINIO-LINEAS-AT.md).

---

## El núcleo de cálculo

`nucleo/` contiene funciones **puras**: sin DOM, sin red, sin estado global. Es la parte del sistema
que tiene que sobrevivir a cualquier cambio de tecnología.

| Módulo | Qué resuelve |
|---|---|
| [`nucleo/geodesia.js`](nucleo/geodesia.js) | Vincenty sobre WGS84, azimuts, deflexiones, progresivas, vano viento, vano ideal de regulación |
| [`nucleo/mecanica.js`](nucleo/mecanica.js) | catenaria y parábola, carga de viento, ecuación de cambio de estado, tramos de tensión |
| [`nucleo/termica.js`](nucleo/termica.js) | resistencia en c.c., ampacidad IEEE Std 738, derrateo térmico |
| [`nucleo/cargas.js`](nucleo/cargas.js) · [`longitudinal.js`](nucleo/longitudinal.js) | los dos ejes del veredicto de un apoyo: carga transversal y longitudinal |
| [`nucleo/cargabilidad.js`](nucleo/cargabilidad.js) · [`cargabilidadAncho.js`](nucleo/cargabilidadAncho.js) | los parámetros eléctricos medidos: lee la exportación del SCADA tal como sale y contrasta la corriente con la ampacidad |
| [`nucleo/electrica.js`](nucleo/electrica.js) | las variables operativas de la línea |
| [`nucleo/umbrales.js`](nucleo/umbrales.js) | los ocho indicadores, cada uno con su semáforo **y su fuente normativa** |
| [`nucleo/rca.js`](nucleo/rca.js) | método de causa raíz. Ordena la investigación; **nunca marca la causa** |

### Está verificado, no supuesto

```bash
npm test
```

| Qué | Contra qué se comprobó | Resultado |
|---|---|---|
| Geodesia | constantes WGS84 publicadas (1° de latitud = 110 574,389 m; cuarto de meridiano = 10 001 965,7 m) | coincide al milímetro |
| Geodesia | los 25 vanos ya calculados en el módulo original | desviación máx. **4,5 × 10⁻⁶ m** |
| Catenaria vs parábola | vano más desfavorable de LN-627 (336,70 m) | diferencia **0,04 %** |
| Resistencia c.c. | tabla de fabricante, Darien AAAC 283,4 mm² | **1,3 %** de desviación |
| Ampacidad IEEE 738 | monotonía y sensibilidades físicas | 718 A a 90 °C, coherente |
| **Cambio de estado** | la identidad física `ΔL = térmico + elástico`, con las longitudes por **catenaria** — vía independiente del solver | error de **0,002 a 0,029 mm** sobre 189 m de cable |
| **Vano peso** | coherencia física en 6 escenarios de relieve | correcto, y detecta **arrancamiento** |

---

## Cómo se trabaja aquí

Este repositorio forma parte del ecosistema `~/Desktop/GitHub-MJ/` y comparte su **kernel de
cerebro** con los proyectos hermanos.

```bash
npm run brain:check    # audita el cerebro y la integridad del kernel
npm run brain:pull     # trae el kernel canónico desde ../brain-private/kernel/
npm run brain:diff     # compara el estado del cerebro entre proyectos
npm test               # suite del núcleo de cálculo
```

- El **kernel** (`scripts/*.mjs`) no se edita aquí: se edita en `../brain-private/kernel/` y se
  reparte con `brain:pull`. Editarlo dentro del repo bloquea el commit.
- El cerebro del proyecto vive en `CLAUDE.md` y `docs/` numerados. Punto de entrada:
  [`docs/00-INDICE.md`](docs/00-INDICE.md).

### Datos de cliente

**No entran en este repositorio.** Coordenadas GPS reales, fotografías de campo, informes y el HTML
original viven en la bóveda privada `../brain-private/` o en almacenamiento privado. El `.gitignore`
los bloquea por patrón, pero eso es la segunda línea de defensa: la primera es no ponerlos ahí.

---

## Estado

⚡ **En producción.** La aplicación está desplegada y en uso sobre una línea real, con acceso por
usuario y trazabilidad: catorce pestañas de análisis, tres informes imprimibles, registro
fotográfico georreferenciado, atlas climático del corredor y **parámetros eléctricos medidos**
—un mes de exportaciones horarias de SCADA, con la corriente contrastada contra la ampacidad—.

El núcleo de cálculo sigue siendo el activo y sigue **sin deuda de validación** en lo portado; la
suite completa pasa de **2.600 pruebas**. Lo que falta no es código: es el **dato de campo** de la
ficha estructural, y la ficha del fabricante del conductor que permite **firmar** —no solo
publicar— el dictamen térmico.

> Este sistema no certifica nada. Certifica el ingeniero que firma. El trabajo del sistema es hacer
> barato comprobar que ese ingeniero tiene razón.

Detalle vivo → [`docs/05-ESTADO-GLOBAL.md`](docs/05-ESTADO-GLOBAL.md) ·
decisiones → [`docs/99-HISTORIAL-ADR.md`](docs/99-HISTORIAL-ADR.md)

---

## Licencia

`UNLICENSED` — software privado. Todos los derechos reservados.
