# Despliegue

Tres piezas, todas en plan gratuito:

| Pieza | Servicio | Detalle |
|---|---|---|
| API | Render, servicio web `reservas-api` | Docker, región Frankfurt. Lo define [`render.yaml`](render.yaml). |
| Frontend | Firebase Hosting, proyecto `reservas-6d51b` | `https://reservas-6d51b.web.app`. Lo define [`firebase.json`](firebase.json). |
| Base de datos | Neon, rama `production` (Londres) | PostgreSQL. Flyway migra al arrancar la API. |

Render lee `render.yaml` de la rama `main`: fusiona antes la rama de trabajo en `main`.

Ningún secreto va al repo. Los valores que pegas en Render se quedan en su panel.

## 1. Neon: datos de conexión

1. En la consola de Neon abre el proyecto, rama `production`, y pulsa **Connect**.
2. Elige la base de datos y el rol, y **apaga el interruptor "Connection pooling"**. El host no debe llevar `-pooler`.
   Neon lo recomienda para las migraciones: su pooler (PgBouncer en modo transacción) no admite los bloqueos de sesión
   que usa Flyway. La API ya tiene su propio pool de conexiones (HikariCP).
3. Apunta del texto de conexión que muestra Neon:
   - host: `ep-xxxx-xxxx.<región>.aws.neon.tech`
   - base de datos, por ejemplo `neondb`
   - usuario (rol)
   - contraseña

Con eso se monta la variable `SPRING_DATASOURCE_URL`. Va en formato JDBC, **sin** usuario ni contraseña dentro (esos van en sus propias variables):

```
jdbc:postgresql://<host>/<base-de-datos>?sslmode=verify-full&sslfactory=org.postgresql.ssl.DefaultJavaSSLFactory&channelBinding=require
```

- `sslmode=verify-full` cifra **y** comprueba que el certificado es de Neon y del host al que te conectas. Con `require` el canal va cifrado pero cualquiera que se interponga podría presentar su propio certificado.
- `sslfactory=org.postgresql.ssl.DefaultJavaSSLFactory` hace que el driver valide con los certificados raíz de la JVM. Sin él, `verify-full` busca un `root.crt` en el directorio del usuario, que en el contenedor no existe, y la conexión falla.
- `channelBinding=require` impide que un intermediario rebaje la autenticación. Ojo con el nombre: Neon escribe `channel_binding` (con guion bajo) y el driver JDBC lo llama `channelBinding` (el driver del proyecto, `org.postgresql:postgresql` 42.7.14, tiene esa propiedad). Una propiedad con otro nombre se ignora sin avisar.

**Esta combinación no se ha probado contra Neon.** Si la API no conecta, mira el log de Render y prueba en este orden:

1. **Plan B**, si el error es de autenticación o de SCRAM: quita solo `&channelBinding=require` y mantén `verify-full`:
   `jdbc:postgresql://<host>/<base-de-datos>?sslmode=verify-full&sslfactory=org.postgresql.ssl.DefaultJavaSSLFactory`
2. **Plan C**, si el error es de certificado (`PKIX path building failed`, `No subject alternative names`): `?sslmode=require`. La conexión va cifrada pero sin comprobar el servidor. Es el último recurso: anota por qué lo usas.

## 2. Firebase: cuenta de servicio y cuenta demo

1. **Cuenta de servicio propia, con el mínimo permiso.** La clave que Firebase genera por defecto (`firebase-adminsdk-...`) tiene permisos muy amplios sobre el proyecto, y esa clave acaba pegada en Render. La API solo lee, crea, actualiza y borra usuarios de Authentication, así que crea una cuenta que solo pueda eso. En [Google Cloud Console](https://console.cloud.google.com), con el proyecto `reservas-6d51b` seleccionado:
   1. **IAM y administración**, **Cuentas de servicio**, **Crear cuenta de servicio**. Nombre: `reservas-api`.
   2. En "Conceder a esta cuenta de servicio acceso al proyecto", elige el rol **Firebase Authentication Admin** (`roles/firebaseauth.admin`) y ningún otro. **Continuar**, **Listo**.
   3. Abre la cuenta `reservas-api`, pestaña **Claves**, **Agregar clave**, **Crear clave nueva**, tipo **JSON**. Se descarga un fichero: guárdalo **fuera del repo**.

   Si en el log de Render aparece `Demo account provisioning failed ... PERMISSION_DENIED`, a esa cuenta le falta un permiso: no lo arregles dándole un rol amplio sin mirar antes qué operación falla. Este rol no se ha probado desde aquí.
2. Render necesita ese JSON en una sola línea. En PowerShell, desde la carpeta donde está:
   ```powershell
   Get-Content .\clave.json -Raw | ConvertFrom-Json | ConvertTo-Json -Compress | Set-Clipboard
   ```
   Pega el contenido del portapapeles en `FIREBASE_SERVICE_ACCOUNT_JSON` (paso 3). Después, limpia las huellas de la clave privada:
   - Pulsa **Win+V** y elige **Borrar todo** en el historial del portapapeles.
   - Borra el JSON descargado **sin pasar por la papelera**: selecciónalo y pulsa **Shift+Supr**.
3. **No crees la cuenta demo a mano en Authentication.** La API la crea sola al arrancar, con el uid fijo `demo-owner`, el email de `DEMO_EMAIL` y la contraseña de `DEMO_PASSWORD`, y la restaura cada noche a las 4:00 (Madrid). Si ya existe un usuario con ese email y otro uid (lo creaste a mano o alguien registró el email público de la demo), la API **lo borra sola** y vuelve a crear la cuenta demo: el log de Render muestra el aviso `Demo email was taken by uid <uid>: that account was deleted; its plans remain and must be cleaned by hand`. Borrar esa cuenta no borra sus planos en la base de datos: si te importa, límpialos a mano. Si el borrado o el reintento fallan, el log muestra `Demo account provisioning failed` con los códigos del error, el plano de la demo se restaura igualmente y se vuelve a intentar a la noche siguiente. Si ya lo creaste a mano, no hace falta que lo borres.
4. Comprueba en Authentication, Sign-in method, que **Google** y **Correo electrónico/contraseña** están activados. En Authentication, Settings, Authorized domains, `reservas-6d51b.web.app` y `reservas-6d51b.firebaseapp.com` ya vienen autorizados; `reservas-api-0vml.onrender.com` no hace falta, porque Firebase Auth solo corre en el frontend.
5. Si la clave de API de la web (la de `frontend/src/environments/environment.ts`) tiene restricción de referrers HTTP, añade en Google Cloud Console, APIs y servicios, Credenciales, esa clave de navegador:
   - `https://reservas-6d51b.web.app/*`
   - `https://reservas-6d51b.firebaseapp.com/*`: el helper de `signInWithPopup` (`/__/auth/iframe`) corre en ese dominio y llama a Firebase con la misma clave.
   - `http://localhost:4200/*`, solo si sigues desarrollando en local con esa clave.
6. **Protección reCAPTCHA apagada.** En Authentication, Settings (Seguridad), comprueba que la protección con reCAPTCHA o reCAPTCHA Enterprise para correo electrónico/contraseña **no** está activada. Si lo está en modo de aplicación, el SDK de Firebase cargará scripts y marcos de Google (`https://www.google.com/recaptcha/...`, y los de `gstatic.com/recaptcha`) que la CSP de `firebase.json` bloquea, y el login y el registro con correo fallarán. Si decides activarla, amplía la CSP en las **dos** reglas: `script-src` con `https://www.google.com/recaptcha/` y `https://www.gstatic.com/recaptcha/`, y `frame-src` con `https://www.google.com/recaptcha/` y `https://recaptcha.google.com/recaptcha/`; mira la consola del navegador por si falta algún host más (el SDK referencia `https://www.google.com/recaptcha/enterprise.js` y `api.js`; la lista es orientativa y no está probada). Ajusta también `frontend/src/environments/production.spec.ts`.
7. **La contraseña de la demo es pública.** Cualquiera puede entrar como `demo-owner`. En Authentication, Settings, **User actions**, desactiva **Enable delete** (según la documentación de Firebase, los ajustes de esa página impiden que los usuarios finales creen o borren cuentas; **no** desactives "Enable create", porque la página de registro la necesita). No he encontrado en la documentación un ajuste que impida cambiar el email desde el cliente; la protección contra enumeración de emails (en la misma página; Firebase la recomienda) hace que el cambio directo de email falle, pero no está probado que cubra la API REST. Sea como sea, el reinicio nocturno de la demo (`ensureUser`) vuelve a poner el email y la contraseña de `DEMO_EMAIL` y `DEMO_PASSWORD` a las 4:00 (Madrid) y vuelve a crear la cuenta si la borraron. Hasta entonces la demo puede no dejar entrar.

## 3. Render: la API

1. En Render: **New**, **Blueprint**, conecta el repositorio de GitHub, rama `main`. Render lee `render.yaml` y propone el servicio `reservas-api`.
2. Render pregunta el valor de las variables marcadas `sync: false`. Estas son todas las que debes rellenar; las demás ya van con valor en `render.yaml`:

   | Variable | Qué poner |
   |---|---|
   | `SPRING_DATASOURCE_URL` | `jdbc:postgresql://<host>/<base-de-datos>?sslmode=verify-full&sslfactory=org.postgresql.ssl.DefaultJavaSSLFactory&channelBinding=require` (paso 1, con sus planes B y C) |
   | `SPRING_DATASOURCE_USERNAME` | El rol de Neon |
   | `SPRING_DATASOURCE_PASSWORD` | La contraseña del rol |
   | `FIREBASE_SERVICE_ACCOUNT_JSON` | El JSON de la cuenta de servicio, en una línea (paso 2) |
   | `DEMO_EMAIL` | Email de la cuenta demo, el que quieras mostrar en el README |
   | `DEMO_PASSWORD` | Contraseña de la cuenta demo. Se publica, así que no la reutilices |
   | `TELEGRAM_BOT_TOKEN` | Opcional. Vacía para que los avisos vayan solo al log |
   | `TELEGRAM_BOT_USERNAME` | Opcional. Hace falta junto al token |

   Render solo pregunta estas variables al crear el Blueprint. Una secreta nueva que añadas después va a mano, en el panel del servicio, Environment.
3. Despliega. La primera vez construye la imagen con Maven y tarda varios minutos.
4. Cuando termine, copia la URL pública del servicio. Debe ser `https://reservas-api-0vml.onrender.com`. Si Render la dio con otro sufijo porque el nombre estaba cogido, cámbiala en dos sitios (hay un test, `frontend/src/environments/production.spec.ts`, que comprueba que coinciden):
   - `apiBaseUrl` de `frontend/src/environments/environment.ts`
   - el `connect-src` de las dos reglas de Content-Security-Policy de `firebase.json`
5. Abre `https://reservas-api-0vml.onrender.com/actuator/health`: debe responder `{"status":"UP"}`.
6. En los logs de Render busca el arranque (`Started ReservasApiApplication`) y las migraciones de Flyway. Comprueba que **no** aparece ninguno de estos mensajes, porque la API arranca igualmente aunque Firebase falle y la demo se vería rota sin avisar:
   - `Firebase identity provider is disabled`: `FIREBASE_SERVICE_ACCOUNT_JSON` no es una cuenta de servicio utilizable (suele ser el JSON cortado o partido en varias líneas).
   - `Identity provider not configured`: la API usa el sustituto que solo escribe en el log; la cuenta demo no se crea ni se borran usuarios de Firebase.
   - `Demo account provisioning failed`: la API no pudo crear o restaurar la cuenta demo en Firebase (credenciales, permisos del rol o un usuario con ese email y otro uid; ver paso 3 de la sección 2).
   - `Demo account credentials are not configured`: falta `DEMO_EMAIL` o `DEMO_PASSWORD`.
   - `Demo restore on startup failed`: falló la restauración del plano de la demo en la base de datos.

   Debe salir `Demo plan restored`.

### Memoria

El plan gratuito da 512 MB. El `Dockerfile` fija `JAVA_TOOL_OPTIONS` con un heap máximo del 60 % y las opciones que lo acompañan (cada una está explicada allí). Si Render avisa de que el servicio se reinició por falta de memoria, define `JAVA_TOOL_OPTIONS` en el panel del servicio, Environment: sustituye al valor de la imagen entero, así que repite los flags que quieras conservar y baja `MaxRAMPercentage`.

### IP del cliente (`FORWARD_HEADERS_STRATEGY=native`)

La API limita las reservas (10 por minuto y 10 al día por local) y las consultas por código (30 por minuto) **por IP**, y solo lee la que resuelve Tomcat con `getRemoteAddr()`. Detrás de Render esa IP llega en `X-Forwarded-For`, y `native` solo la acepta si la petición viene de un proxy interno. El valor por defecto de `server.tomcat.remoteip.internal-proxies` en Spring Boot 4.1.2 ya cubre `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` y `100.64.0.0/10`.

Hay dos dudas sin comprobar, y las dos acaban igual (el cupo deja de ser por persona):

- **Que Tomcat vea la IP del balanceador de Render**, por ejemplo si el balanceador no está en esos rangos privados: entonces no procesa `X-Forwarded-For` y **todos los visitantes comparten el mismo cupo** (10 reservas por minuto para toda la web). Es el caso grave.
- **Que Tomcat vea la IP de un edge de Cloudflare**: Render pone Cloudflare delante de su balanceador. Si el balanceador añade al final de `X-Forwarded-For` la IP de Cloudflare (que no es un proxy interno), Tomcat se para ahí y la toma como la del cliente. Los clientes que pasen por el mismo edge comparten cupo.

Ninguna permite falsear la IP (el valor que escribe el cliente queda a la izquierda del real y no se lee), pero hay que comprobar cuál es la IP que ve la API. La API no la registra, así que se pide a Tomcat que la escriba. Comprobación, en este orden:

1. En Render, servicio `reservas-api`, Environment, añade **temporalmente** `LOGGING_LEVEL_ORG_APACHE_CATALINA_VALVES=DEBUG` y guarda (Render reinicia el servicio).
2. Haz una petición cualquiera, por ejemplo abre `https://reservas-api-0vml.onrender.com/actuator/health`, y anota tu IP pública (en Git Bash: `curl -s ifconfig.me`; en IPv6 saldrá la dirección IPv6).
3. En los logs de Render busca la línea de `RemoteIpValve` de esa petición: `Incoming request /actuator/health with originalRemoteAddr ... will be seen as newRemoteAddr=...` (o, si Tomcat no trata la petición como venida de un proxy interno, `Skip RemoteIpValve ... originalRemoteAddr ...`). Compara `newRemoteAddr` con tu IP:
   - **Es tu IP**: todo bien. Quita la variable del paso 1.
   - **Es una IP privada** (`10.x`, `100.64.x`...), la del balanceador: caso grave, cupo global. Tomcat no ha aceptado el proxy o no ha encontrado la cabecera. Mira `originalRemoteAddr` y aplica la **opción A** con el rango al que pertenece esa IP.
   - **Es una IP pública que no es la tuya**, normalmente un edge de Cloudflare (rangos de https://www.cloudflare.com/ips-v4 y https://www.cloudflare.com/ips-v6): aplica la **opción A** con los rangos de Cloudflare.
4. **Quita `LOGGING_LEVEL_ORG_APACHE_CATALINA_VALVES`** al terminar, también si todo estaba bien: el nivel DEBUG escribe cada petición.

No he probado este mecanismo en Render. El nombre de la variable sale de la configuración de logging por defecto de Spring Boot; si el log no muestra nada, prueba con `LOGGING_LEVEL_ORG_APACHE_CATALINA=DEBUG`.

**Opción A (la recomendada): ampliar los proxies internos**, solo por variable de entorno en Render (Environment) y redespliega: `SERVER_TOMCAT_REMOTEIP_INTERNAL_PROXIES`, una lista de CIDR separados por comas. **Sustituye a la lista por defecto**, así que hay que repetirla entera y añadir lo que falte. La de Spring Boot 4.1.2 (`spring-configuration-metadata.json` de `spring-boot-tomcat`) es:

```
10.0.0.0/8, 192.168.0.0/16, 169.254.0.0/16, 100.64.0.0/10, fc00::/7, 172.16.0.0/12, ::1/128, 127.0.0.0/8, fe80::/10
```

Ejemplo para Cloudflare: esa lista más los rangos actuales de las dos URLs de arriba (IPv4 e IPv6), que Cloudflare cambia de vez en cuando. Tomcat salta esos proxies al recorrer `X-Forwarded-For` de derecha a izquierda y se queda con la primera IP que no sea de la lista, la del cliente. Riesgo: si un visitante llegara con una IP dentro de esos rangos (por ejemplo, con WARP de Cloudflare), Tomcat la saltaría y leería el valor siguiente de la izquierda, que escribe el cliente; para un límite de reservas es un riesgo menor, pero no es cero. Repite la comprobación.

**Opción B, última opción: `SERVER_TOMCAT_REMOTEIP_REMOTE_IP_HEADER=CF-Connecting-IP`.** Tomcat toma la IP de esa cabecera, que escribe Cloudflare, en lugar de recorrer `X-Forwarded-For`. No he encontrado que Render documente que esa cabecera llegue siempre al servicio ni que sea Cloudflare quien la escribe: si no está, o si una petición llega al servicio sin pasar por Cloudflare, el cliente la puede poner él mismo y falsear su IP (vaciar su cupo a voluntad). Úsala solo si la A no funciona, y repite la comprobación mandando tú una petición con `-H "CF-Connecting-IP: 1.2.3.4"`: `newRemoteAddr` no debe ser `1.2.3.4`.

`render.yaml` deja `native` solo; es una decisión que depende del resultado de la comprobación.

## 4. Firebase Hosting: el frontend

Requiere Node 24 (el de `.github/workflows/ci.yml`) y tener la API ya desplegada (la URL va dentro del build). Desde la raíz del repo:

```bash
npx firebase-tools login
cd frontend
npm ci
npm run build
cd ..
npx firebase-tools deploy --only hosting
```

`npm run build` acaba con `scripts/check-hosting-config.mjs`, que falla si el `index.html` construido lleva un script en línea que la política de `firebase.json` no autoriza (ver abajo) y avisa si hay ficheros con hash fuera de los sitios que cubre la caché `immutable`. `deploy` sube `frontend/dist/frontend/browser` al proyecto `reservas-6d51b` (`.firebaserc`).

### Cabeceras de `firebase.json`

- **Rutas reservadas `/__/**`:** ninguna regla las toca. Hosting sirve ahí el helper de `signInWithPopup` (`/__/auth/iframe`, `/__/auth/handler`, sus scripts) en `reservas-6d51b.firebaseapp.com`, y una CSP con `frame-ancestors 'none'`, un COOP o una caché `immutable` nuestros lo romperían o lo dejarían desfasado.
- **Para todo lo demás:** `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Cross-Origin-Opener-Policy: same-origin-allow-popups` (con `same-origin` se rompe el popup de Google) y un `Permissions-Policy` sin cámara, micrófono, geolocalización ni pagos.
- **Content-Security-Policy**, con `frame-ancestors 'none'` en todo menos en `/r/**` y `/reserva/**`, que sí se incrustan en webs ajenas (`frame-ancestors *`). Firebase casa las reglas de `headers` con la ruta que pide el navegador, antes del rewrite a `index.html`, y no documenta qué pasa cuando dos reglas dan la misma cabecera. Por eso las reglas que dan la misma cabecera no se solapan: la CSP va en `/@(r|reserva)/**` y en su complementaria `!/@(r|reserva|__)/**`, y `Cache-Control` en tres reglas, la última la negación de las otras y de `/__/**`. Ninguna ruta casa con dos.
- **Caché:** `public, max-age=31536000, immutable` para `/*.js`, `/*.css` y `/media/*.woff|woff2` (llevan hash en el nombre; es la estructura que emite el build de Angular) y `no-cache` para todo lo demás, incluido `index.html` y las rutas de la aplicación, que Hosting sirve con ese fichero.
- **El hash `'sha256-...'` de `script-src`** autoriza el único script en línea que genera el build de producción de Angular (activa la hoja de estilos principal). Si una actualización de Angular lo cambia, `npm run build` falla y escribe el hash nuevo que hay que poner en las dos reglas.
- **`style-src 'unsafe-inline'`**: Angular inyecta los estilos de cada componente como etiquetas `<style>`, y el build mete el CSS crítico en línea. No hay otra forma sin nonces, que un sitio estático no puede dar.
- **`script-src https://apis.google.com`**: el SDK de Firebase Auth carga ahí el cargador de Google (`gapi`) cuando se usa `signInWithPopup`. **`frame-src`** deja solo el helper de Firebase (`/__/auth/iframe` en `reservas-6d51b.firebaseapp.com`). La ventana de Google es un popup, no un iframe, y no pasa por la CSP de la página.

## 5. Comprobaciones tras desplegar

**Cabeceras** (Git Bash). El resultado esperado va debajo:

```bash
BASE=https://reservas-6d51b.web.app
for path in / /entrar /panel /ruta-que-no-existe /r/demo /reserva/ABC123 /r/demo/; do
  echo "== $path: $(curl -sI "$BASE$path" | grep -ic '^content-security-policy') CSP"
  curl -sI "$BASE$path" | grep -ioE "frame-ancestors [^;]*|cache-control:.*|x-frame-options:.*"
done
```

- `/`, `/entrar`, `/panel` y `/ruta-que-no-existe`: **1 CSP**, `frame-ancestors 'none'`, `Cache-Control: no-cache`.
- `/r/demo`, `/r/demo/` y `/reserva/ABC123`: **1 CSP**, `frame-ancestors *`, `Cache-Control: no-cache`.
- Ninguna con `X-Frame-Options`.
- Un fichero con hash, por ejemplo el `main-XXXX.js` que lista `frontend/dist/frontend/browser`: `curl -sI $BASE/main-XXXX.js | grep -i cache-control` da `public, max-age=31536000, immutable`.
- **Rutas reservadas de Hosting** (las usa el login con Google): no deben llevar nada nuestro.
  ```bash
  curl -sI https://reservas-6d51b.firebaseapp.com/__/auth/iframe | grep -iE 'content-security|cross-origin-opener|cache-control|x-content-type|permissions-policy|referrer-policy'
  ```
  Si sale la CSP `default-src 'self'; ...`, `Cross-Origin-Opener-Policy: same-origin-allow-popups`, `Permissions-Policy` o `X-Content-Type-Options` nuestros, Hosting aplica las reglas también a `/__/**` pese al `source` negado: el login con Google fallará. Las cabeceras que ponga el propio Hosting en esa ruta no cuentan.

Si alguna ruta sale con **2** CSP, o con ninguna, Hosting no está aplicando las reglas como se espera (por ejemplo, la negación `!` en `source`). Con 2 CSP el navegador aplica las dos y gana `frame-ancestors 'none'`: `/r/**` dejaría de incrustarse. En ese caso hay que rediseñar los `source` de `headers`; el test `frontend/src/environments/production.spec.ts` fija hoy el diseño de reglas complementarias.

**CORS** de la API: la respuesta debe llevar `access-control-allow-origin: https://reservas-6d51b.web.app`:

```bash
curl -s -o /dev/null -D - -H "Origin: https://reservas-6d51b.web.app" https://reservas-api-0vml.onrender.com/api/v1/restaurants/demo | grep -i access-control-allow-origin
```

Es un `GET` a propósito: `curl -I` manda `HEAD`, que la configuración de CORS de la API no admite, y daría un falso fallo.

**En el navegador** (con las herramientas de desarrollo abiertas, pestaña Console):

1. Abre `https://reservas-api-0vml.onrender.com/actuator/health` y espera a `UP`. Así la API está despierta.
2. Abre `https://reservas-6d51b.web.app/entrar`: la página sale con sus estilos y sin errores de "Content Security Policy" en la consola.
3. **Entrar con Google**: se abre el popup, eliges cuenta y vuelves al panel. Si la consola muestra una violación de CSP con un host nuevo (`apis.google.com` ya está), añade ese host a `script-src`, `connect-src` o `frame-src` en las **dos** reglas de `firebase.json`, y ajusta `frontend/src/environments/production.spec.ts`.
4. **Entrar con correo y contraseña**: en `/entrar`, con `DEMO_EMAIL` y `DEMO_PASSWORD`, debe llevar al panel y mostrar el plano de la demo. Si falla, mira los logs de Render (sección 3, paso 6): la cuenta la crea la API.
5. **Registro**: en `/registro`, crea una cuenta con un correo tuyo de prueba. Debe entrar al panel. Después bórrala en Authentication, Usuarios, y no la dejes con datos. Si el registro falla en silencio con la consola limpia, revisa la protección reCAPTCHA (sección 2, paso 6).
6. **Reserva en `/r/demo`**: elige mesa, completa el formulario y reserva. Abre la página con el código de la reserva (`/reserva/<código>`).
7. **Incrustar**: guarda una página HTML con `<iframe src="https://reservas-6d51b.web.app/r/demo?embed=1" width="100%" height="720"></iframe>` y ábrela desde otro origen (por ejemplo un servidor local). Debe verse. La misma prueba con `/entrar` debe quedar bloqueada. Con un iframe **sin** `?embed=1`, el enlace "reservas." de la cabecera debe abrir el panel en la ventana superior, no en blanco dentro del iframe.
8. **IP del cliente**: la comprobación de la sección 3, "IP del cliente".

## 6. Límites del plan gratuito

- **Render se duerme** tras 15 minutos sin tráfico entrante y tarda alrededor de un minuto en despertar. Mientras arranca, el navegador recibe su página de carga y las llamadas de la web a la API fallan: la página pública muestra "No se pudo cargar el plano". Antes de enseñar la demo, abre `/actuator/health` y espera a `UP`.
- El plan gratuito da 750 horas de instancia al mes. Un solo servicio despierto todo el mes cabe, pero si superas el tope Render suspende los servicios gratuitos hasta el mes siguiente.
- **Neon** suspende el cómputo a los 5 minutos sin consultas (en el plan gratuito no se puede desactivar) y despierta en menos de un segundo. Las horas de cómputo mensuales son limitadas: revisa el consumo en la consola de Neon, Billing o Usage.
- Los trabajos periódicos de la API consultan la base de datos: la caducidad de reservas pendientes, cada 5 minutos, y, solo si Telegram está configurado, el sondeo de enlaces pendientes, cada 5 segundos. Con tan poca pausa, **mientras Render está despierto Neon casi no llega a suspenderse** y gasta horas de cómputo. Cuando Render se duerme, Neon se suspende unos 5 minutos después. El health check de Render consulta además la base de datos. Los trabajos de anonimización y de reinicio de la demo también corren al arrancar, así que despertar Render los pone al día.
- Render puede reiniciar un servicio gratuito en cualquier momento y su disco es efímero. La API no guarda nada en disco: todo va a Neon.

## 7. Pendiente tras el primer despliegue

- La cuenta demo del recuadro "Prueba la demo" de la página de entrar: añade `demoAccount: { email, password }` a `frontend/src/environments/environment.ts` con los valores de `DEMO_EMAIL` y `DEMO_PASSWORD`, y vuelve a desplegar el frontend.
