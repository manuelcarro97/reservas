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
jdbc:postgresql://<host>/<base-de-datos>?sslmode=require&channelBinding=require
```

Ojo con el nombre: Neon escribe `channel_binding` (con guion bajo) y el driver JDBC lo llama `channelBinding` (el driver del proyecto, `org.postgresql:postgresql` 42.7.14, tiene esa propiedad). Una propiedad con otro nombre se ignora sin avisar.

Si la API no conecta y el log de Render muestra un error de autenticación o de SCRAM, quita `&channelBinding=require` y deja solo `?sslmode=require`. Esa combinación no se ha probado contra Neon desde aquí.

## 2. Firebase: cuenta de servicio y cuenta demo

1. Consola de Firebase, proyecto `reservas-6d51b`, Configuración del proyecto, **Cuentas de servicio**, **Generar nueva clave privada**. Se descarga un JSON. Guárdalo **fuera del repo**.
2. Render necesita ese JSON en una sola línea. En PowerShell, desde la carpeta donde está:
   ```powershell
   Get-Content .\clave.json -Raw | ConvertFrom-Json | ConvertTo-Json -Compress | Set-Clipboard
   ```
   Pega el contenido del portapapeles en `FIREBASE_SERVICE_ACCOUNT_JSON` (paso 3) y borra el JSON descargado cuando termines.
3. **No crees la cuenta demo a mano en Authentication.** La API la crea sola al arrancar, con el uid fijo `demo-owner`, el email de `DEMO_EMAIL` y la contraseña de `DEMO_PASSWORD`, y la restaura cada noche a las 4:00 (Madrid). Si ya existe un usuario con ese email y otro uid, la restauración falla en cada intento con un error de email ya existente. Si ya lo creaste, bórralo en Authentication, Usuarios.
4. Comprueba en Authentication, Sign-in method, que **Google** y **Correo electrónico/contraseña** están activados. En Authentication, Settings, Authorized domains, `reservas-6d51b.web.app` y `reservas-6d51b.firebaseapp.com` ya vienen autorizados; `reservas-api.onrender.com` no hace falta, porque Firebase Auth solo corre en el frontend.
5. Si la clave de API de la web (la de `frontend/src/environments/environment.ts`) tiene restricción de referrers HTTP, añade en Google Cloud Console, APIs y servicios, Credenciales, esa clave de navegador:
   - `https://reservas-6d51b.web.app/*`
   - `https://reservas-6d51b.firebaseapp.com/*`: el helper de `signInWithPopup` (`/__/auth/iframe`) corre en ese dominio y llama a Firebase con la misma clave.
   - `http://localhost:4200/*`, solo si sigues desarrollando en local con esa clave.

## 3. Render: la API

1. En Render: **New**, **Blueprint**, conecta el repositorio de GitHub, rama `main`. Render lee `render.yaml` y propone el servicio `reservas-api`.
2. Render pregunta el valor de las variables marcadas `sync: false`. Estas son todas las que debes rellenar; las demás ya van con valor en `render.yaml`:

   | Variable | Qué poner |
   |---|---|
   | `SPRING_DATASOURCE_URL` | `jdbc:postgresql://<host>/<base-de-datos>?sslmode=require&channelBinding=require` (paso 1) |
   | `SPRING_DATASOURCE_USERNAME` | El rol de Neon |
   | `SPRING_DATASOURCE_PASSWORD` | La contraseña del rol |
   | `FIREBASE_SERVICE_ACCOUNT_JSON` | El JSON de la cuenta de servicio, en una línea (paso 2) |
   | `DEMO_EMAIL` | Email de la cuenta demo, el que quieras mostrar en el README |
   | `DEMO_PASSWORD` | Contraseña de la cuenta demo. Se publica, así que no la reutilices |
   | `TELEGRAM_BOT_TOKEN` | Opcional. Vacía para que los avisos vayan solo al log |
   | `TELEGRAM_BOT_USERNAME` | Opcional. Hace falta junto al token |

   Render solo pregunta estas variables al crear el Blueprint. Una secreta nueva que añadas después va a mano, en el panel del servicio, Environment.
3. Despliega. La primera vez construye la imagen con Maven y tarda varios minutos.
4. Cuando termine, copia la URL pública del servicio. Debe ser `https://reservas-api.onrender.com`. Si Render la dio con otro sufijo porque el nombre estaba cogido, cámbiala en dos sitios (hay un test, `frontend/src/environments/production.spec.ts`, que comprueba que coinciden):
   - `apiBaseUrl` de `frontend/src/environments/environment.ts`
   - el `connect-src` de las dos reglas de Content-Security-Policy de `firebase.json`
5. Abre `https://reservas-api.onrender.com/actuator/health`: debe responder `{"status":"UP"}`.
6. En los logs de Render busca el arranque (`Started ReservasApiApplication`), las migraciones de Flyway y que **no** aparezca un WARN `Demo restore on startup failed`.

### Memoria

El plan gratuito da 512 MB. El `Dockerfile` fija `JAVA_TOOL_OPTIONS` con un heap máximo del 60 % y las opciones que lo acompañan (cada una está explicada allí). Si Render avisa de que el servicio se reinició por falta de memoria, define `JAVA_TOOL_OPTIONS` en el panel del servicio, Environment: sustituye al valor de la imagen entero, así que repite los flags que quieras conservar y baja `MaxRAMPercentage`.

### IP del cliente (`FORWARD_HEADERS_STRATEGY=native`)

La API limita las reservas (10 por minuto) y las consultas por código (30 por minuto) **por IP**, y solo lee la que resuelve Tomcat con `getRemoteAddr()`. Detrás de Render esa IP llega en `X-Forwarded-For`, y `native` solo la acepta si la petición viene de un proxy interno. El valor por defecto de `server.tomcat.remoteip.internal-proxies` en Spring Boot 4.1.2 ya cubre `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` y `100.64.0.0/10`.

La duda, sin comprobar: Render pone Cloudflare delante de su balanceador. Si el balanceador añade al final de `X-Forwarded-For` la IP de Cloudflare (que no es un proxy interno), Tomcat se para ahí y toma la IP del edge de Cloudflare como la del cliente. Los clientes que pasen por el mismo edge compartirían cupo. No es un fallo de seguridad (nadie puede falsear su IP con esa cabecera), pero el límite dejaría de ser por persona.

La API no registra la IP del cliente, así que no se ve en sus logs. La comprobación es por comportamiento, con dos redes distintas:

1. Desde el ordenador, en Git Bash, gasta el cupo de consultas (30 por minuto). Cuenta aunque el código no exista:
   ```bash
   for i in $(seq 1 35); do curl -s -o /dev/null -w "%{http_code}\n" https://reservas-api.onrender.com/api/v1/reservations/NOEXISTE1; done | sort | uniq -c
   ```
   Debe salir `429` en las últimas peticiones (las 30 primeras pasan, con el código de "no encontrada" o "no válida" que dé la API): el límite funciona.
2. En los 60 segundos siguientes, desde el móvil **con datos móviles** (otra IP), abre `https://reservas-api.onrender.com/api/v1/reservations/NOEXISTE1`.
   - Cualquier respuesta que no sea 429 (lo normal es un JSON de "no encontrada"): la API ve IPs distintas. Todo bien.
   - Respuesta 429: la API ve la misma IP para los dos, la del proxy. Aplica el arreglo de abajo.

Arreglo, solo por variable de entorno en Render (Environment, y redespliega):

- `SERVER_TOMCAT_REMOTEIP_REMOTE_IP_HEADER=CF-Connecting-IP`. Según la documentación de Render, Cloudflare escribe esa cabecera en cada petición y pisa la que mande el cliente. Tomcat solo la acepta si la petición llega de un proxy interno. Repite la prueba.
- Alternativa: `SERVER_TOMCAT_REMOTEIP_TRUSTED_PROXIES` con una expresión regular de los rangos de Cloudflare (https://www.cloudflare.com/ips/), para que Tomcat los salte en la cadena de `X-Forwarded-For`. Más frágil: los rangos cambian.

Elegir una u otra es una decisión pendiente; `render.yaml` deja `native` solo.

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
curl -sI -H "Origin: https://reservas-6d51b.web.app" https://reservas-api.onrender.com/api/v1/restaurants/demo | grep -i access-control-allow-origin
```

**En el navegador** (con las herramientas de desarrollo abiertas, pestaña Console):

1. Abre `https://reservas-api.onrender.com/actuator/health` y espera a `UP`. Así la API está despierta.
2. Abre `https://reservas-6d51b.web.app/entrar`: la página sale con sus estilos y sin errores de "Content Security Policy" en la consola.
3. **Entrar con Google**: se abre el popup, eliges cuenta y vuelves al panel. Si la consola muestra una violación de CSP con un host nuevo (`apis.google.com` ya está), añade ese host a `script-src`, `connect-src` o `frame-src` en las **dos** reglas de `firebase.json`, y ajusta `frontend/src/environments/production.spec.ts`.
4. **Reserva en `/r/demo`**: elige mesa, completa el formulario y reserva. Abre la página con el código de la reserva (`/reserva/<código>`).
5. **Incrustar**: guarda una página HTML con `<iframe src="https://reservas-6d51b.web.app/r/demo?embed=1" width="100%" height="720"></iframe>` y ábrela desde otro origen (por ejemplo un servidor local). Debe verse. La misma prueba con `/entrar` debe quedar bloqueada.
6. **IP del cliente**: la prueba de la sección "IP del cliente".

## 6. Límites del plan gratuito

- **Render se duerme** tras 15 minutos sin tráfico entrante y tarda alrededor de un minuto en despertar. Mientras arranca, el navegador recibe su página de carga y las llamadas de la web a la API fallan: la página pública muestra "No se pudo cargar el plano". Antes de enseñar la demo, abre `/actuator/health` y espera a `UP`.
- El plan gratuito da 750 horas de instancia al mes. Un solo servicio despierto todo el mes cabe, pero si superas el tope Render suspende los servicios gratuitos hasta el mes siguiente.
- **Neon** suspende el cómputo a los 5 minutos sin consultas (en el plan gratuito no se puede desactivar) y despierta en menos de un segundo. Las horas de cómputo mensuales son limitadas: revisa el consumo en la consola de Neon, Billing o Usage.
- Los trabajos periódicos de la API consultan la base de datos: la caducidad de reservas pendientes, cada 5 minutos, y, solo si Telegram está configurado, el sondeo de enlaces pendientes, cada 5 segundos. Con tan poca pausa, **mientras Render está despierto Neon casi no llega a suspenderse** y gasta horas de cómputo. Cuando Render se duerme, Neon se suspende unos 5 minutos después. El health check de Render consulta además la base de datos. Los trabajos de anonimización y de reinicio de la demo también corren al arrancar, así que despertar Render los pone al día.
- Render puede reiniciar un servicio gratuito en cualquier momento y su disco es efímero. La API no guarda nada en disco: todo va a Neon.

## 7. Pendiente tras el primer despliegue

- La cuenta demo del recuadro "Prueba la demo" de la página de entrar: añade `demoAccount: { email, password }` a `frontend/src/environments/environment.ts` con los valores de `DEMO_EMAIL` y `DEMO_PASSWORD`, y vuelve a desplegar el frontend.
