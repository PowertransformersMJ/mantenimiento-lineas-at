# `usuarios/` — el trabajador administrativo de personas

Da de alta, cambia permisos, apaga y restituye cuentas **desde la aplicación**,
sin llave maestra en ningún portátil y dejando bitácora de quién hizo qué. Y
desde el 2026-09-06 es también **el único escritor de reclamos** del sistema:
arranca al propietario una sola vez y ejecuta la limpieza inicial (`99 §ADR-100`).

La herramienta de línea de comandos que hacía esto desde la Mac **se retiró del
repositorio** por orden del Ingeniero («todo lo viejo se borra»). Lo único que
sobrevive, FUERA del repo y en la bóveda privada, es el rescate (`rescate.mjs`,
§8): la consola de Firebase no sabe escribir reclamos, y si este trabajador se
cae nadie más puede devolverle permisos a nadie.

> La vía canónica de Firebase para esto es una Cloud Function con el SDK de
> administración. Está descartada por escrito: exige el plan Blaze, que **factura
> y no apaga** (`99 §ADR-001`). Este trabajador hace lo mismo con una cuenta de
> servicio guardada como secreto de Cloudflare.

---

## 1 · Qué hace falta antes de desplegar

### 1.1 · La consola de Firebase (la toca el Ingeniero, guiado con pantallazos)

**Antes de desplegar nada.** Quitar el botón de Google de la pantalla NO cierra el
alta pública: la API de Firebase deja crear cuentas con la clave web del proyecto,
que es pública. El cierre real es de consola:

1. **Authentication → Settings → User actions**: desmarcar **«Enable create
   (sign-up)»** y **«Enable delete»**. Desde entonces un alta desde fuera responde
   `auth/admin-restricted-operation`; el alta con cuenta de servicio (la de este
   trabajador) sigue funcionando.
2. **Authentication → Settings → «Email enumeration protection»**: activar.
3. **Authentication → Templates → Password reset → «Expire after»**: subirlo al
   máximo. El enlace de un solo uso caduca en una hora por defecto, y una cuadrilla
   con dos rayas de señal necesita más.
4. **Authentication → Sign-in method → Google**: se apaga **DESPUÉS** del arranque
   (paso 8 del runbook), no antes: hasta entonces es la única forma de entrar.

### 1.2 · La cuenta de servicio (una sola vez)

En la consola de Google Cloud del proyecto `mantenimiento-lineas-at`:

1. **IAM y administración → Cuentas de servicio → Crear**. Nombre sugerido:
   `administrador-de-personas`. **Dedicada a este trabajador**: nunca la de
   despliegue, nunca una con Owner/Editor.
2. **Roles — los dos mínimos, y ni uno más:**

   | Rol | Para qué | Por qué no vale menos |
   |---|---|---|
   | `roles/firebaseauth.admin` | crear cuentas, escribir reclamos, apagar, revocar sesiones, borrar en lote, emitir enlaces | no hay rol predefinido más pequeño; si se quiere afinar, un **rol personalizado** con `firebaseauth.users.create`, `.get`, `.update`, `.delete`, `.sendEmail` |
   | `roles/datastore.user` | escribir el espejo `usuarios/{uid}`, la bitácora `auditoria_accesos` y los dos cerrojos de `config/` | la cuenta de servicio **se salta las reglas**: es el único camino a una colección con `allow write: if false` |

   Dicho sin adornos: con esos dos roles esta cuenta puede reescribir cualquier
   documento de la base, bitácora incluida. La inmutabilidad de la bitácora es
   **frente a clientes, no frente a este trabajador**. Por eso la cuenta es
   dedicada, se anota su fecha en `docs/05` y se rota cada 90 días.
3. **Claves → Añadir clave → JSON.** Se descarga un archivo.

> ⚠️ Ese archivo **jamás entra en el repositorio** (que es público), ni se pega en
> un chat, ni se manda por correo. Del disco a `wrangler secret put` **desde un
> archivo** (`< ruta`), y una copia a la bóveda privada para el rescate. Si alguna
> vez se sospecha que se filtró: se borra la clave en la consola y se crea otra —
> el trabajador se queda en 503 hasta que se ponga la nueva.

### 1.3 · Los tres secretos

```bash
cd usuarios
npx wrangler secret put CUENTA_DE_SERVICIO < /ruta/en/la/boveda/cuenta-de-servicio.json
npx wrangler secret put PROPIETARIO_UID        # se teclea el uid que enseña la consola tras crear la cuenta
npx wrangler secret put LIMPIEZA_TOKEN         # de UN SOLO USO: se pone justo antes de la limpieza y se borra después
```

| Secreto | Qué es | Si falta |
|---|---|---|
| `CUENTA_DE_SERVICIO` | el JSON entero (cabe: tope 5 KB, ronda 2,3 KB) | **todo** responde 503 |
| `PROPIETARIO_UID` | el uid de la cuenta del propietario, creada en la consola | `/bootstrap` responde 503: nadie se corona por una variable ausente |
| `LIMPIEZA_TOKEN` | secreto de un solo uso para el borrado inicial | `POST /limpieza-inicial` responde 503 |

⚠️ Se teclean o se leen de archivo; **nunca con `echo`**, que añade un salto de
línea al valor y deja el secreto mal puesto sin que nada avise. `GET /estado` dice
si el arranque está configurado sin revelar el uid.

### 1.4 · Las variables (van en `wrangler.toml`, no son secretas)

| Variable | Hoy | Qué pasa si falta |
|---|---|---|
| `PROYECTO_FIREBASE` | `mantenimiento-lineas-at` | 503 |
| `ORG_PERMITIDA` | `transpower` | 503 |
| `ORIGEN_PERMITIDO` | la dirección de la aplicación | CORS vacío; **no es un control de acceso** |
| `REVOCADOS_ANTES_DE` | `""` | sin corte. Con una marca (ISO o segundos), **todo token emitido antes se rechaza**. Una marca ilegible apaga el servicio (503) |
| `APP_CHECK_EXIGIDO` | `"false"` | ponerlo en `"true"` **apaga el servicio** (§6) |

`REVOCADOS_ANTES_DE` existe en los DOS trabajadores (este y el portero de fotos,
`evidencias/`) y se pone en los dos a la vez en el paso 9 del runbook: es lo que
convierte «revocado en una hora» en «revocado ya» en las dos puertas.

---

## 2 · Desplegar

```bash
cd usuarios && npx wrangler deploy
cd ../evidencias && npx wrangler deploy      # el portero migró a funciones (ev/ea): va en la misma ola
```

Y en la aplicación, `VITE_USUARIOS_URL` en `web/.env.production` apuntando a la
dirección del despliegue (ya está: `https://lineas-at-usuarios.ajimenezp99.workers.dev`),
que además tiene que estar en `connect-src` de `web/public/_headers`.
`npm run deploy --workspace web` NO construye: siempre `npm run build` delante y
comprobar el nombre del paquete servido (`35 · L-35`, `L-75`).

Comprobación inmediata, sin sesión:

```bash
curl https://lineas-at-usuarios.ajimenezp99.workers.dev/salud    # {"ok":true,...} o 503 con `falta`
curl https://lineas-at-usuarios.ajimenezp99.workers.dev/estado   # {"configurado":true,"arrancado":false,...}
```

---

## 3 · Lo que atiende

Todo lleva `Authorization: Bearer <token de Firebase>`, cuya **firma se verifica**
contra las llaves públicas de Google (`comun/token-de-firebase.js`, el mismo
módulo que usa el portero de fotos), más el corte `REVOCADOS_ANTES_DE`. Se exige
`orgId == ORG_PERMITIDA` en todo salvo en el arranque, que por definición llega
sin reclamos.

| Ruta | Quién | Qué hace |
|---|---|---|
| `GET /salud` | nadie (sin sesión) | si puede trabajar, versión, contadores |
| `GET /estado` | nadie (sin sesión) | `configurado`, `arrancado`, `limpiezaHecha`, `revocadosAntesDe` — sin uid ni correo |
| `POST /bootstrap` | la cuenta del propietario, recién entrada con contraseña | **de un solo uso**: acuña al propietario y pone el cerrojo `config/arranque` (§4) |
| `GET /usuarios` | administra personas | la lista, fusionando Auth + espejo; dice qué roles puede repartir quien pregunta |
| `POST /usuarios` | ídem | alta, `modo: 'enlace' \| 'contrasena'` |
| `PATCH /usuarios/:uid` | ídem | rol, funciones, alcance, nombre |
| `POST /usuarios/:uid/deshabilitar` · `/restituir` · `/estado` | ídem | apagar y encender (`/estado` es la misma operación con `{activo}` en el cuerpo) |
| `POST /usuarios/:uid/contrasena` | ídem | repone provisional, o emite enlace |
| `POST /usuarios/:uid/reconciliar` | ídem | rehace el espejo desde los reclamos reales |
| `GET /limpieza-inicial?simular=1` | **solo el propietario** | el ENSAYO: qué se borraría, sin borrar (§5) |
| `POST /limpieza-inicial` | solo el propietario + `X-Limpieza-Token` | el borrado, en lotes de 8, con lápida y bitácora ANTES |

Cambiar la propia contraseña **no pasa por aquí**: se hace en el navegador, con la
contraseña actual delante (`web/src/componentes/Contrasena.tsx`). Un servidor que
la cambiara viendo solo un token válido perdería esa reautenticación.

### La autoridad sale del ESTADO VIVO, no del papel

El token demuestra **quién** llama —su firma no se puede falsificar—, pero no
demuestra qué puede hacer HOY: un token de identidad de Firebase vive hasta una
hora y **no se invalida** al apagar una cuenta ni al cambiarle el rol. Por eso,
antes de cualquier operación administrativa, este trabajador pregunta a Google
por el estado actual de quien llama. Y para la expulsión inmediata está
`REVOCADOS_ANTES_DE`.

### La jerarquía, que va más allá de «sea admin»

* Al **`propietario` no lo toca la aplicación**, ni él mismo — por rol Y por uid
  configurado: ni correo, ni contraseña, ni apagado. Lo repara `/bootstrap` (el
  mismo uid) o el rescate de la bóveda.
* **La fila de `admin` es del propietario**: un administrador no nombra a otro, no
  lo degrada, no lo apaga y no le repone la contraseña.
* **«Un igual» no incluye a uno mismo.** Bajarse el rol o apagarse la propia cuenta
  son gestos legítimos — y ahí salta el fusible del último administrador (409).
* Un `admin` con reclamos **anteriores al catálogo** (sin `usuarios.gestionar`)
  recibe 403: el propietario le corrige la cuenta desde la pantalla de personas.

---

## 4 · El arranque (`POST /bootstrap`)

Lo que el comité del delta tumbó del primer diseño, y cómo quedó:

| Fallo del primer diseño | Ahora |
|---|---|
| Se anclaba a un CORREO publicado en el repo | se ancla al **uid** (`PROPIETARIO_UID`), que la consola enseña al crear la cuenta |
| «Comprobar que no hay propietario» y «estampar» eran dos pasos: carrera | **una** escritura con precondición `exists=false` en `config/arranque`; la segunda llamada falla en Google, no en una comprobación nuestra |
| Variable ausente → `undefined === undefined` coronaba a cualquiera | **503** si falta `PROPIETARIO_UID` |
| Un token cualquiera | exige `sign_in_provider = password` y `auth_time` ≤ 5 min |
| Se rearmaba solo si no había propietario vivo | con el cerrojo puesto responde **409 para siempre** salvo al mismo uid, que solo REPARA. Rearmar = borrar `config/arranque` a mano en la consola (las reglas no dejan a ningún cliente, ni admin, escribirlo ni borrarlo) |

La pantalla «Inicializar sistema» aparece cuando hay sesión y no hay reclamos
válidos; tras 200 y tras 409 fuerza la relectura del token dos veces y, si sigue
sin reclamos, dice «salga y vuelva a entrar» — nunca «pida acceso al administrador».

---

## 5 · La limpieza inicial (`/limpieza-inicial`)

La única operación **irreversible**. Cuatro redes, todas del comité:

1. **Ensayo obligatorio**: `GET ?simular=1` devuelve la lista exacta (uid, correo
   enmascarado, proveedores, estado) y la deja en la bitácora.
2. **Secreto de un solo uso** en la cabecera `X-Limpieza-Token`; se pone con
   `wrangler secret put LIMPIEZA_TOKEN` justo antes y se borra con
   `wrangler secret delete LIMPIEZA_TOKEN` justo después.
3. **El cuerpo es el del ensayo**: `{ total, uids, confirmacion: 'BORRAR', orgId }`,
   idéntico o 400. Nunca incluye al propietario ni a quien llama (400).
4. **Lápida y bitácora ANTES de borrar, en un solo viaje**: por cuenta, un
   `accounts:update` (reclamos vacíos + `disableUser` + `validSince`), luego UN
   `commit` con `usuarios/{uid}` (`activo:false, borradoEn, borradoPor, correo,
   nombre`) y su entrada `borrado`, y solo entonces `accounts:batchDelete` con
   `force:false` (Google solo borra las ya deshabilitadas). Lotes de 8 (≈12
   subpeticiones de las 50 del plan gratuito); responde 202 mientras queden y
   guarda el progreso en `config/limpieza`; se apaga sola al terminar (409).

Antes de ejecutarla: `REVOCADOS_ANTES_DE = ahora` en los DOS trabajadores. Sin
eso, un token emitido antes del borrado sigue valiendo hasta una hora.

---

## 6 · Los límites, y cuáles NO están verificados

| Límite | Cifra | Estado |
|---|---|---|
| Peticiones a Workers | **100.000/día** por cuenta (compartido con el portero de fotos) | ✅ verificado 2026-09-05 en `developers.cloudflare.com/workers/platform/limits` |
| CPU por petición | 10 ms; la espera de red no cuenta | ✅ ídem; la firma RSA medida cuesta ~1 ms |
| Subpeticiones por invocación | **50** | ✅ ídem; por eso la limpieza va en lotes de 8 |
| Altas por hora y por IP | **100** (Identity Toolkit) | ✅ verificado en `firebase.google.com/docs/auth/limits`; ⚠️ la IP es la de salida de Cloudflare |
| Enlaces de contraseña | 1.500/día en Spark (`returnOobLink`); correos 150/día | ✅ ídem |
| Tamaño del token | 1.000 bytes | ✅ el catálogo mide antes de escribir y **rechaza con motivo** |
| Peso del trabajador | 200 KiB · 41 KiB comprimido | ✅ `wrangler deploy --dry-run` 2026-09-06 |

**El freno propio** (30 escrituras por persona cada 10 minutos) es *best-effort*
y se dice: varios aislados, varias cuentas. No es un control de seguridad.

**App Check**: hoy este trabajador **no sabe comprobarlo**. `APP_CHECK_EXIGIDO`
va en `false` y ponerlo en `true` **apaga el servicio** en vez de fingir.

---

## 7 · Cuando algo va mal

| Síntoma | Qué es | Qué hacer |
|---|---|---|
| Todo responde **503** | falta configuración o el secreto | `GET /salud` dice el nombre exacto de lo que falta |
| `/bootstrap` **503** | falta `PROPIETARIO_UID` | ponerlo (§1.3); `GET /estado` lo confirma sin revelarlo |
| `/bootstrap` **403** | uid distinto, entrada sin contraseña o sesión de más de 5 min | salir, entrar con contraseña y pulsar de nuevo; comprobar el uid |
| `/bootstrap` **409** | ya hay cerrojo | el mismo uid REPARA; otro uid, nunca. Rearmar = borrar `config/arranque` en la consola |
| **401** «sesión anterior a la revocación» | el corte `REVOCADOS_ANTES_DE` | salir y volver a entrar |
| **403** «sus permisos son anteriores al catálogo» | el token trae `rol` pero no `f` | el propietario corrige la cuenta desde la pantalla de personas |
| **409** «es la última persona activa que puede administrar» | el fusible | nombrar a otro administrador primero |
| La respuesta trae `bitacora: "fallo"` | la operación SÍ se hizo; el registro no | mirar `fallosDeBitacora` en `/salud` y las reglas de `auditoria_accesos` |
| Una fila sale `desincronizado` | espejo y token no dicen lo mismo | `POST /usuarios/:uid/reconciliar` — **el token manda siempre** |
| **502** «Google rechazó la operación» | el problema es de la cuenta de servicio | revisar los roles IAM de §1.2 y que la clave siga viva |
| **El trabajador no responde y nadie puede entrar** | | el rescate de la bóveda (§8) |

---

## 8 · El rescate (fuera del repo)

`~/Desktop/GitHub-MJ/brain-private/mantenimiento-lineas-at/herramientas/rescate.mjs`,
con el JSON de la cuenta de servicio dedicada guardado al lado, en la bóveda.

```bash
GOOGLE_APPLICATION_CREDENTIALS=/ruta/en/la/boveda/cuenta-de-servicio.json \
  node ~/Desktop/GitHub-MJ/brain-private/mantenimiento-lineas-at/herramientas/rescate.mjs auditar

GOOGLE_APPLICATION_CREDENTIALS=... node .../rescate.mjs reponer-propietario --uid <uid>
```

Dos órdenes y ninguna más: `auditar` (cuentas sin reclamos, reclamos de antes del
catálogo, espejos divergentes, ¿hay propietario y cerrojo?) y
`reponer-propietario` (re-estampa los reclamos de propietario con `reclamosDe()`
del catálogo, revoca sesiones, repara `config/arranque`, deja bitácora con actor
`rescate-boveda`). No da de alta a nadie: el alta es del sistema.

---

## 9 · El runbook del corte (quién hace cada paso)

0. **Él**: decide el correo del propietario — distinto del de su cuenta Google.
1. **Él, consola** (§1.1): sign-up y delete apagados · enumeración protegida · «Expire after» al máximo.
2. **Él, GCP** (§1.2): cuenta de servicio dedicada → llave JSON a un archivo → copia a la bóveda.
3. **Claude**: `wrangler secret put CUENTA_DE_SERVICIO < archivo` · desplegar `usuarios/` y `evidencias/` · `GET /estado` → `configurado:false` (falta el uid) · prueba de humo: alta desechable con `targetProjectId` → funciona → se borra.
4. **Él, consola**: Add user (correo del paso 0 + contraseña) → le dice a Claude el **uid** (no es secreto).
5. **Claude**: `wrangler secret put PROPIETARIO_UID` · `npm run build` + desplegar la web (sin Google, con «Inicializar sistema») · comprobar el paquete servido.
6. **Él**: entra con contraseña → «Inicializar» → ve sus reclamos. **Validación en vivo en su Chrome, la conduce Claude.**
7. **Claude**: desplegar reglas + índices. Prueba: él abre la línea y sube una foto.
8. **Él, consola**: apagar Google. Ensayo del rescate de contraseña («Restablecer» en su fila → el correo llega).
9. **Claude**: `REVOCADOS_ANTES_DE = ahora` en los dos trabajadores · ensayo de limpieza → **le enseña la lista** → él confirma → `LIMPIEZA_TOKEN` → borrado → `wrangler secret delete`.
10. **Claude**: grep de referencias a cero · cabeceras de seguridad en despliegue APARTE (Report-Only primero) · ADR-100 · cerebro.
