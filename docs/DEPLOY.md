# Despliegue de fik en producción

Guía paso a paso para publicar fik en `mifik.cl`. Los archivos que usa viven en `deploy/` y el
despliegue automático en `.github/workflows/deploy.yml`.

## Arquitectura

```
Usuario (Chile)
   │ HTTPS
Cloudflare ─── mifik.cl ─────► Cloudflare Pages (landing, apps/landing)
   │       └── app.mifik.cl ─► Cloudflare Pages (app, apps/web)
   │ HTTPS · certificado de origen · Authenticated Origin Pulls
   ▼ api.mifik.cl
EC2 t4g.small, AWS Ohio (us-east-2)
   Docker: Caddy (TLS) → API NestJS
   │ red privada de AWS, TLS
   ▼
RDS PostgreSQL 16 db.t4g.micro (us-east-2): 5432 solo para el servidor y las IP admitidas
```

- **Solo Cloudflare llega al servidor:** el security group abre el puerto 443 solo a las IP de
  Cloudflare, y Caddy exige el certificado de cliente de Cloudflare. No hay puerto SSH: al servidor
  se entra con AWS Systems Manager (Session Manager).
- **Sin load balancer ni NAT Gateway** (cada uno sumaría ~US$16–32/mes).
- **ARM (Graviton):** ~20% más barato; GitHub Actions construye la imagen para `linux/arm64`.
- **Costo (precios de AWS, 2026-10-11, 730 h/mes):** EC2 US$12,3 + disco 20 GB US$1,6 + IP pública
  US$3,7 + RDS US$11,7 + disco RDS 20 GB US$2,3 ≈ **US$32/mes**. Todo se cobra por hora de existencia,
  no por uso.
- **Por qué Ohio y no São Paulo (2026-10-11):** São Paulo costaba ≈ US$55/mes con el mismo diseño
  (EC2 US$0,0268/h y RDS US$0,034/h contra US$0,0168 y US$0,016). Medido desde Chile, Ohio suma
  ~100 ms por llamada (~170 ms contra ~66 ms); Virginia cuesta lo mismo con ~10 ms menos, pero es la
  región con más caídas grandes. México no conviene (mismo precio, más latencia). AWS aún no abre
  Santiago. Mudarse después: réplica de RDS entre regiones + promover, servidor recreado con estos
  scripts, IP nueva en Cloudflare.

## 1. Cuenta de AWS

1. Crear la cuenta con `mifik.general@gmail.com` (Gmail con verificación en dos pasos).
2. **MFA en el usuario raíz** (_Security credentials → Assign MFA device_).
3. Un **usuario administrador** aparte para el día a día (IAM Identity Center o IAM). El raíz
   queda solo para facturación.
4. **Alerta de presupuesto:** _Billing → Budgets_ → US$45/mes, aviso al 80% y al 100% (y al 100%
   proyectado). Es una alarma, no un tope: AWS sigue cobrando.
5. Región arriba a la derecha: **US East (Ohio) `us-east-2`**. Todo va ahí.

## 2. Red y firewalls (VPC por defecto)

En **EC2 → Security Groups** crear dos grupos en la VPC por defecto:

| Nombre    | Entrada                                               | Para        |
| --------- | ----------------------------------------------------- | ----------- |
| `fik-api` | (vacío por ahora; el paso 6 abre el 443 a Cloudflare) | El servidor |
| `fik-db`  | PostgreSQL (5432) desde el security group `fik-api`   | La base     |

La salida de ambos queda como viene (todo permitido): el servidor necesita descargar imágenes y
consultar mindicador.cl e IPinfo.

## 3. Base de datos (RDS)

**RDS → Create database:**

- Standard create · **PostgreSQL 16** (la misma versión que CI y local).
- Plantilla: **Free tier** o **Dev/Test**, **Single-AZ**.
- Identificador: `fik-db`. Usuario maestro: `fik_admin`, contraseña generada y guardada en un gestor
  de contraseñas.
- Instancia: **db.t4g.micro**. Almacenamiento: **gp3, 20 GB**, autoescalado hasta 50 GB.
- Conectividad: VPC por defecto, security group **`fik-db`** (quitar el `default`). Se creó con
  **Public access: No** y el 2026-10-11 pasó a **Yes** para administrarla desde un PC (DBeaver,
  psql): el security group igual solo abre el 5432 al servidor y a las IP agregadas con
  `deploy/aws/db-allow-my-ip.sh`, y RDS exige TLS (una conexión sin cifrar se rechaza). Ver
  "Ver la base desde un PC" más abajo.
- Nombre inicial de la base: **`fik`**.
- Respaldos automáticos: **1 día**, por decisión (2026-10-11): restauración a cualquier minuto de
  las últimas 24 h; subirlo si hace falta (`aws rds modify-db-instance --db-instance-identifier
fik-db --backup-retention-period 7 --apply-immediately`, requiere el plan pagado de AWS: el
  gratuito lo limita a 1). Cifrado: **activado**. **Deletion protection: activado**. PostgreSQL
  16.15.

Al terminar, copiar el **endpoint** (`fik-db.xxxx.us-east-2.rds.amazonaws.com`).

**Usuarios de la base** (2026-10-11, `deploy/aws/db-roles.sql`, correrlo una vez como `fik_admin`
con las contraseñas de Parameter Store; volver a correrlo es seguro):

| Usuario       | Lo usa                                         | Puede                                         |
| ------------- | ---------------------------------------------- | --------------------------------------------- |
| `fik_app`     | el API y el seed del catálogo (`DATABASE_URL`) | leer y escribir filas; no crear/borrar tablas |
| `fik_migrate` | las migraciones (`DIRECT_DATABASE_URL`)        | dueño del esquema y de todas las tablas       |
| `fik_admin`   | administración (DBeaver); nunca el servidor    | todo (usuario maestro de RDS)                 |

Las tablas que creen migraciones futuras le dan permisos a `fik_app` solas (default privileges).

## 4. Registro de imágenes (ECR)

**ECR → Create repository:** privado, nombre **`fik-api`**, _Scan on push_ activado.
Luego, en _Lifecycle policy_: conservar solo las **últimas 10 imágenes**.

## 5. Permisos (IAM)

### 5a. Rol del servidor

**IAM → Roles → Create role** → _AWS service_ → **EC2**. Políticas administradas:

- `AmazonSSMManagedInstanceCore` (entrar por Session Manager y recibir los despliegues)
- `AmazonEC2ContainerRegistryReadOnly` (descargar la imagen del API)

Y una política en línea con `deploy/aws/api-ec2-parameters-policy.json` (reemplazando
`ACCOUNT_ID`): leer los parámetros `/fik/prod/*`, de donde sale `api.env`, y **nunca** `/fik/admin/*`.

Nombre: `fik-api-ec2`.

### 5b. GitHub Actions sin claves (OIDC)

1. **IAM → Identity providers → Add provider:** OpenID Connect,
   URL `https://token.actions.githubusercontent.com`, audience `sts.amazonaws.com`.
2. **IAM → Roles → Create role → Custom trust policy:** pegar
   `deploy/aws/github-deploy-trust-policy.json` reemplazando `ACCOUNT_ID` (12 dígitos, arriba a la
   derecha en la consola). Solo el environment `production` de este repo puede asumirlo.
3. Agregar una política en línea con `deploy/aws/github-deploy-permissions-policy.json`,
   reemplazando `ACCOUNT_ID` e `INSTANCE_ID` (este último se conoce en el paso 6; se puede volver a
   editar). Permite subir solo la imagen `fik-api` y enviar el comando de despliegue solo a ese
   servidor.
4. Nombre: `fik-github-deploy`. Copiar su **ARN**.

## 6. Servidor (EC2)

**EC2 → Launch instance:**

- Nombre `fik-api`. AMI **Amazon Linux 2023**, arquitectura **64-bit (Arm)**.
- Tipo **t4g.small** (2 GB de RAM).
- Key pair: **Proceed without a key pair** (no se usa SSH).
- Red: VPC por defecto, subred pública, **auto-assign public IP: Enable**, security group
  **`fik-api`**.
- Disco: **gp3, 20 GB**, cifrado.
- _Advanced → IAM instance profile:_ **`fik-api-ec2`**.

Después:

1. **Elastic IP** (_EC2 → Elastic IPs → Allocate_ → _Associate_ a `fik-api`), para que la IP no
   cambie si el servidor se reinicia. Copiar la IP y el **instance ID** (`i-...`).
2. **Abrir el 443 solo a Cloudflare:** desde **AWS CloudShell** (ícono `>_` arriba), subir
   `deploy/aws/cloudflare-sg.sh` y correr `bash cloudflare-sg.sh <id-del-sg-fik-api>`.
3. **Entrar al servidor:** _EC2 → la instancia → Connect → Session Manager → Connect_.
4. Preparar el servidor: crear `bootstrap-ec2.sh` con el contenido de `deploy/aws/bootstrap-ec2.sh`
   (por ejemplo `sudo tee /tmp/bootstrap-ec2.sh` y pegar) y correr `sudo bash /tmp/bootstrap-ec2.sh`.
   Instala Docker y Compose y descarga a `/opt/fik/certs` los certificados de RDS y de Cloudflare.

## 7. Cloudflare: `api.mifik.cl`

1. **Certificado de origen:** _SSL/TLS → Origin Server → Create Certificate_ → RSA, hostnames
   `api.mifik.cl`, validez 15 años. Guardar el certificado en el servidor como
   `/opt/fik/certs/origin.pem` y la clave como `/opt/fik/certs/origin.key`
   (`sudo chmod 600 /opt/fik/certs/origin.key`). **La clave no se vuelve a mostrar** y nunca va al
   repo.
2. **Authenticated Origin Pulls:** _SSL/TLS → Origin Server → Authenticated Origin Pulls_ →
   **activado** (a nivel de zona).
3. **DNS:** registro **A** `api` → la Elastic IP, con la nube **naranja** (proxied).
4. El modo SSL/TLS ya está en **Completo (Estricto)** y "Usar siempre HTTPS" activado.

## 8. Archivos del servidor (`/opt/fik`)

Con Session Manager (o `aws ssm send-command`), crear en `/opt/fik`:

| Archivo              | Desde                       | Notas                               |
| -------------------- | --------------------------- | ----------------------------------- |
| `docker-compose.yml` | `deploy/docker-compose.yml` | tal cual                            |
| `Caddyfile`          | `deploy/Caddyfile`          | tal cual                            |
| `deploy.sh`          | `deploy/deploy.sh`          | `sudo chmod 700 /opt/fik/deploy.sh` |
| `deploy.env`         | `deploy/deploy.env.example` | con el registry de ECR              |
| `render-api-env.sh`  | `deploy/aws/`               | escribe `api.env` (ver abajo)       |

**`api.env` no se escribe a mano.** Las variables del API viven en **Parameter Store**
(Systems Manager → Parameter Store → Ohio, gratis): **cada parámetro `/fik/prod/<NOMBRE>` es una
variable del API con ese nombre**: _SecureString_ para secretos, _String_ para el resto.
`render-api-env.sh` las lee todas y escribe `/opt/fik/api.env` (chmod 600); `deploy.sh` lo corre
antes de cada despliegue, así que **agregar o cambiar una variable = crear o editar el parámetro y
desplegar**. Si falta una obligatoria, aborta sin tocar el archivo ni el API en marcha.

- El grupo `DATABASE_*` no se copia tal cual: arma las conexiones. `DATABASE_HOST` (endpoint de RDS),
  `DATABASE_APP_PASSWORD` (`fik_app`), `DATABASE_MIGRATE_PASSWORD` (`fik_migrate`) y
  la del maestro, que vive **fuera** de esta ruta: `/fik/admin/DATABASE_ADMIN_PASSWORD`. El rol del
  servidor tiene un _Deny_ explícito sobre `/fik/admin/*` (la política administrada
  `AmazonSSMManagedInstanceCore` le deja leer cualquier parámetro de la cuenta, y un Deny explícito
  gana).
- Secretos (cada uno `openssl rand -base64 48`; `MFA_ENCRYPTION_KEY` con `openssl rand -hex 32`),
  **distintos a los de desarrollo**: los de `deploy/api.env.example`. Parameter Store es su
  respaldo: perder `MFA_ENCRYPTION_KEY` o `IDENTIFIER_HASH_SECRET` deja ilegibles datos guardados.
- Configuración (_String_): `CORS_ORIGIN`, `PASSKEY_RP_ID`, `TRUST_PROXY_HOPS`, `PUBLIC_SITE_URL`,
  `JWT_ACCESS_EXPIRES`, `JWT_REFRESH_EXPIRES`, `EMAIL_FROM`, `EMAIL_REPLY_TO`.
- `IPINFO_TOKEN` (opcional) si se quiere el país de cada sesión.
- `RESEND_API_KEY`: una clave **Sending access** restringida al dominio `mifik.cl` (nunca Full
  access). Sin ella el API arranca igual, pero no envía correos: verificar el correo y recuperar la
  contraseña responden `503 EMAIL_UNAVAILABLE`.
- `PUBLIC_SITE_URL=https://mifik.cl`: los enlaces de los correos abren páginas del sitio público
  (`/es/verify-email/`, `/es/reset-password/`). `EMAIL_FROM`/`EMAIL_REPLY_TO`: hoy ambos
  `contacto@mifik.cl` (sin el parámetro, el API usa `fik <no-reply@mifik.cl>` / `contacto@mifik.cl`).

## 9. Despliegue automático (GitHub Actions)

**Ramas:** se trabaja en **`dev`** (el CI corre en cada push, nunca despliega) y se integra a
**`main`** con merge: eso es lo único que publica. `.github/workflows/deploy.yml` corre cuando el
**CI pasa en `main`** y despliega **solo lo que cambió** desde el último despliegue exitoso:

| Destino | Se despliega si cambia                            | Cómo                                                      |
| ------- | ------------------------------------------------- | --------------------------------------------------------- |
| API     | `apps/api/`, `packages/{contracts,money,config}/` | imagen ARM → ECR → `deploy.sh` en EC2 por SSM             |
| App     | `apps/web/`, `packages/`                          | build en GitHub → `wrangler pages deploy` a `fik-app`     |
| Landing | `apps/landing/`, `packages/`                      | build en GitHub → `wrangler pages deploy` a `fik-landing` |

`package.json`, `pnpm-lock.yaml`, `turbo.json` o el propio workflow despliegan los tres. A mano:
_Actions → Deploy → Run workflow_ con `changed` / `all` / `api` / `web` / `landing`. **No despliega
`deploy/`**: los archivos del servidor (`/opt/fik`) se copian aparte (sección 8).

1. _Settings → Environments → New environment_: **`production`**, y en _Deployment branches and
   tags_ → **Selected branches and tags** → solo `main`. Es obligatorio: así ni un despliegue manual
   desde otra rama ni código ajeno llegan a producción (el rol de AWS solo confía en este
   environment). Opcional: _Required reviewers_, para aprobar cada despliegue a mano.
2. _Settings → Secrets and variables → Actions_:
   - Variables: `AWS_DEPLOY_ROLE_ARN` (ARN de `fik-github-deploy`), `AWS_API_INSTANCE_ID` (`i-...`),
     `CLOUDFLARE_ACCOUNT_ID`.
   - Secret: `CLOUDFLARE_API_TOKEN`, un token de cuenta con **Cloudflare Pages · Edit** y nada más.
3. La primera imagen del API tarda ~15 min (emulación ARM); después usa caché.

## 10. Landing y app (Cloudflare Pages)

Dos proyectos, **`fik-landing`** (_Custom domains_ → `mifik.cl`) y **`fik-app`** (`app.mifik.cl`),
rama de producción `main`. Están conectados al repo, pero con **los builds automáticos de Cloudflare
apagados**: los construye y sube el workflow de la sección 9, solo con el CI en verde. Las variables
de build (`VITE_*`, `PUBLIC_*`) están en `deploy.yml`, no en Cloudflare.

- **Rebuild programado del landing** (spec 033, `.github/workflows/landing-rates.yml`): dos veces
  al día (00:20 y 12:20 UTC, después de los registros de las 08:00 y 20:00 de Chile) construye el
  landing desde `main` y lo sube a `fik-landing`, para que el HTML de `/es/valor-uf/`,
  `/es/dolar-observado/` (y sus pares en inglés) y el bloque del home lleven el valor del día que
  leen los buscadores. Corre con `EXCHANGE_RATES_REQUIRED=true`: si la API no responde, el build
  **falla** y queda publicado el sitio anterior (un deploy normal, en cambio, construye sin valores y
  la página los pide al abrirse). Comparte el grupo de concurrencia `deploy` y es un workflow aparte
  para no mover la línea base de `deploy.yml`. Usa las mismas variables y secreto. Se puede correr a
  mano desde Actions → "Landing rates".
- La app es una SPA: sin `404.html` en su salida, Pages sirve `index.html` para cualquier ruta.
- Las URL **no llevan** `/api/v1` ni barra final.
- `public/_headers` agrega cabeceras de seguridad en ambos sitios.

## 11. Verificación

1. `https://api.mifik.cl/api/v1/health` responde `{"status":"ok"}`.
2. Llamar directo a la IP del servidor no responde (solo pasa Cloudflare).
3. En `https://mifik.cl`: crear una cuenta, iniciar sesión, llegar a `app.mifik.cl`.
4. En el navegador, las cookies `access_token`/`refresh_token` dicen **Secure** y **HttpOnly**.
5. Perfil → Seguridad muestra la sesión con su país (si hay `IPINFO_TOKEN`).
6. Registrarse con un correo propio: llega "Confirma tu correo" desde `no-reply@mifik.cl` y su
   enlace abre `mifik.cl/es/verify-email/` y confirma la dirección.
7. _Tipos de cambio_ tiene datos (el API los registra al arrancar y a las 8/12/16/20 h).

## Dónde ver cada cosa

| Qué                              | Dónde                                                                                                |
| -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Estado de la base (CPU, espacio) | AWS → RDS → Ohio → `fik-db`                                                                          |
| Datos de la base                 | DBeaver/psql desde un PC (sección siguiente)                                                         |
| Variables del API                | AWS → Systems Manager → Parameter Store → Ohio → `/fik/prod/*`                                       |
| `api.env` en uso                 | EC2 → `fik-api` → Connect → Session Manager → `sudo cat /opt/fik/api.env` (se genera, no se edita)   |
| Despliegues (API, app, landing)  | GitHub → Actions → Deploy                                                                            |
| Versiones publicadas de Pages    | Cloudflare → Workers & Pages → `fik-landing` / `fik-app` → Deployments                               |
| Logs del API                     | Session Manager → ver Mantenimiento (Logs)                                                           |
| Costos                           | AWS → Billing → Bills (y el presupuesto `fik-monthly`, US$45, que avisa a `mifik.general@gmail.com`) |

## Ver la base desde un PC

1. Abrir el 5432 a tu IP actual (repetirlo cada vez que cambie tu IP; borra la anterior):
   `AWS_PROFILE=fik bash deploy/aws/db-allow-my-ip.sh <tu-nombre>`. Para cerrar todo acceso de PC:
   `... db-allow-my-ip.sh --revoke`.
2. Certificado de la región: `https://truststore.pki.rds.amazonaws.com/us-east-2/us-east-2-bundle.pem`.
3. DBeaver → PostgreSQL: host `fik-db.cfoeucaao0d1.us-east-2.rds.amazonaws.com`, puerto 5432, base
   `fik`, usuario **`fik_readonly`** (contraseña: Parameter Store
   `/fik/admin/DATABASE_READONLY_PASSWORD`). Pestaña **SSL**: _Use SSL_, _Root certificate_ = el
   archivo del paso 2, _SSL mode_ = `verify-full`.
4. `fik_readonly` solo mira: toda transacción suya es de solo lectura y no tiene permiso de
   escritura sobre ninguna tabla. Para corregir algo a propósito, una **segunda conexión** con
   `fik_admin` (`/fik/admin/DATABASE_ADMIN_PASSWORD`): lo que se modifique o borre ahí es real.
5. **Nada del repo se conecta a producción desde un PC:** el API, el CLI de Prisma (toda migración,
   incluido `migrate dev`) y el seed se niegan a arrancar si la URL apunta a RDS y
   `NODE_ENV` no es `production` (`apps/api/src/infra/config/production-database.ts`). Para hacer
   algo deliberado contra producción hay que escribir `NODE_ENV=production` a propósito.

## Mantenimiento

- **Logs:** EC2 → `fik-api` → Conectar → **Administrador de sesiones de SSM** (no "Conexión de la
  instancia EC2": esa usa SSH y el puerto 22 está cerrado a propósito) →
  `sudo docker logs -f --tail 200 $(sudo docker ps -qf label=com.docker.compose.service=api)`.
  El contenedor se busca por etiqueta porque su nombre cambia en cada despliegue (`fik-api-1`,
  `-2`…), y `docker compose logs` no sirve sin exportar `API_IMAGE`. Caddy: `sudo docker logs --tail
100 fik-caddy-1`. En producción el API registra `log`/`warn`/`error`, no el `debug` de cada
  petición; para verlo un rato, el parámetro `/fik/prod/LOG_LEVEL` = `debug` y desplegar.
- **Despliegue sin corte (2026-10-11):** `deploy.sh` arranca el API nuevo junto al viejo, espera a
  que esté sano y recién entonces apaga el viejo (SIGTERM, hasta 30 s para terminar lo que tiene en
  curso). Si el nuevo no queda sano, lo borra y el viejo sigue atendiendo. Caddy reparte entre todos
  los contenedores `api` y reintenta en otro una conexión rechazada. Medido: 1.322 de 1.322 consultas
  bien durante un despliegue. **Dos reglas que lo hacen posible:** (1) una migración corre antes del
  cambio, así que no puede borrar ni renombrar algo que la versión anterior usa (primero agregar,
  quitar en un despliegue siguiente); (2) la app se publica antes que el API, así que un cambio de
  contrato debe aceptar clientes viejos y nuevos. Cambios al Caddyfile: `deploy.sh` lo recarga sin
  reiniciar Caddy. Durante ~1 minuto corren los dos contenedores: evitar desplegar justo a las 00:00
  (hora de Chile), cuando corre el cierre de facturaciones programadas.
- **Desplegar a mano o volver a una versión anterior:** `sudo /opt/fik/deploy.sh <tag>` (los tags
  son el commit corto; ver ECR). Ojo: una migración ya aplicada no se deshace sola.
- **Respaldos:** RDS guarda 1 día con restauración a cualquier minuto. Antes de una migración
  riesgosa, tomar un _snapshot_ manual.
- **IP de Cloudflare:** volver a correr `cloudflare-sg.sh` cada pocos meses.
- **`security.txt` vence el 2027-10-11:** antes de esa fecha, correr `Expires` un año más en
  `apps/landing/public/.well-known/security.txt` (el test de build falla si está vencido). La política
  de seguridad para reportar vulnerabilidades es `SECURITY.md`, en la raíz del repo.
- **Si `prisma migrate deploy` rechaza el certificado de RDS:** `DIRECT_DATABASE_URL` verifica la
  cadena (`sslcert=/certs/rds-ca.pem&sslaccept=strict`). Prisma lee solo el **primer** certificado
  de ese archivo: con el paquete global de RDS fallaba (`P1011 ... self-signed certificate in
certificate chain`, 2026-10-11), por eso `bootstrap-ec2.sh` extrae la raíz de la región a `rds-ca.pem`. No bajarlo a
  `accept_invalid_certs` sin entender por qué falla (ruta del certificado, versión de Prisma).
- **Agregar o cambiar una variable del API:** crear/editar `/fik/prod/<NOMBRE>` en Parameter Store
  (consola o `aws ssm put-parameter --name /fik/prod/<NOMBRE> --type SecureString --overwrite
--value ...`) y desplegar el API (_Actions → Deploy → api_), o en el servidor
  `sudo bash /opt/fik/render-api-env.sh && cd /opt/fik && sudo docker compose up -d api`.
- **Resend (dominio `mifik.cl`, Configuration), 2026-10-11:** _Open tracking_ encendido con el
  subdominio `links.mifik.cl` (CNAME → `links2.resend-dns.com`, nube gris en Cloudflare);
  **_Click tracking_ apagado a propósito**: reescribiría los enlaces de verificar correo y recuperar
  contraseña para pasar por Resend, dejando su token en un tercero (las páginas de la landing borran el
  token y usan `no-referrer` justamente para que no salga). _TLS_: **Enforced**. _Enable Receiving_
  apagado: el correo entrante de `@mifik.cl` lo recibe Cloudflare Email Routing (MX).
- **Ley 21.719:** los datos quedan en Estados Unidos: antes de tener usuarios reales, aceptar con AWS el
  mecanismo de transferencia (cláusulas contractuales modelo) y declararlo en la política de
  privacidad (`.compliance/docs/21719-anexo-transferencias.md`). Lo mismo con Resend.
- **Región Santiago (o volver a São Paulo):** cuando AWS la abra, mover la base con una réplica
  entre regiones y promoverla (minutos de corte), recrear el servidor con estos scripts y cambiar la
  IP de `api` en Cloudflare.
