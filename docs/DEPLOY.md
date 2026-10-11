# Despliegue de fik en producción

Guía paso a paso para publicar fik en `mifik.cl`. Los archivos que usa viven en `deploy/` y el
despliegue automático en `.github/workflows/deploy-api.yml`.

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
RDS PostgreSQL 16 db.t4g.micro (us-east-2), sin acceso público
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
- Conectividad: VPC por defecto, **Public access: No**, security group **`fik-db`** (quitar el
  `default`).
- Nombre inicial de la base: **`fik`**.
- Respaldos automáticos: **7 días**. Cifrado: **activado**. **Deletion protection: activado**.
  En el **plan gratuito** de AWS (cuentas nuevas desde 2025, con créditos) el máximo es **1 día**
  (`FreeTierRestrictionError`): la base se creó así el 2026-10-11 (PostgreSQL 16.15). Al pasar al
  plan pagado, subirlo a 7 con `aws rds modify-db-instance` (`--db-instance-identifier fik-db
--backup-retention-period 7 --apply-immediately`).

Al terminar, copiar el **endpoint** (`fik-db.xxxx.us-east-2.rds.amazonaws.com`).

> Más adelante conviene crear un usuario `fik_app` con permisos solo sobre la base `fik` y que el API
> use ese en vez de `fik_admin`. Para el primer despliegue puede usarse el maestro.

## 4. Registro de imágenes (ECR)

**ECR → Create repository:** privado, nombre **`fik-api`**, _Scan on push_ activado.
Luego, en _Lifecycle policy_: conservar solo las **últimas 10 imágenes**.

## 5. Permisos (IAM)

### 5a. Rol del servidor

**IAM → Roles → Create role** → _AWS service_ → **EC2**. Políticas administradas:

- `AmazonSSMManagedInstanceCore` (entrar por Session Manager y recibir los despliegues)
- `AmazonEC2ContainerRegistryReadOnly` (descargar la imagen del API)

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

**`api.env` no se escribe a mano**: los secretos viven cifrados en **Parameter Store**
(`/fik/prod/<NOMBRE>`, SecureString, gratis) y `sudo bash /opt/fik/render-api-env.sh <endpoint-rds>`
arma `/opt/fik/api.env` (chmod 600) con ellos; si falta uno obligatorio, aborta sin tocar el archivo.

- Obligatorios: `DATABASE_PASSWORD` y los siete de `deploy/api.env.example` (cada uno
  `openssl rand -base64 48`; `MFA_ENCRYPTION_KEY` con `openssl rand -hex 32`), **distintos a los de
  desarrollo**. Parameter Store es su respaldo: perder `MFA_ENCRYPTION_KEY` o
  `IDENTIFIER_HASH_SECRET` deja ilegibles datos guardados.
- `IPINFO_TOKEN` (opcional) si se quiere el país de cada sesión.
- `RESEND_API_KEY`: una clave **Sending access** restringida al dominio `mifik.cl` (nunca Full
  access). Sin ella el API arranca igual, pero no envía correos: verificar el correo y recuperar la
  contraseña responden `503 EMAIL_UNAVAILABLE`.
- `PUBLIC_SITE_URL=https://mifik.cl`: los enlaces de los correos abren páginas del sitio público
  (`/es/verify-email/`, `/es/reset-password/`). `EMAIL_FROM`/`EMAIL_REPLY_TO` tienen valores por
  defecto (`fik <no-reply@mifik.cl>` / `contacto@mifik.cl`).

## 9. GitHub: despliegue automático

1. _Settings → Environments → New environment_: **`production`**, y en _Deployment branches and
   tags_ → **Selected branches and tags** → solo `main`. Es obligatorio: así ni un despliegue manual
   desde otra rama ni código ajeno llegan a producción (el rol de AWS solo confía en este
   environment). Opcional: _Required reviewers_, para aprobar cada despliegue a mano.
2. _Settings → Secrets and variables → Actions → Variables_ (variables, no secrets: no son
   secretos):
   - `AWS_DEPLOY_ROLE_ARN` = ARN del rol `fik-github-deploy`
   - `AWS_API_INSTANCE_ID` = `i-...`
3. _Actions → Deploy API → Run workflow_. Construye la imagen ARM (la primera vez tarda ~15 min por
   la emulación), la sube a ECR y corre `deploy.sh` en el servidor: descarga la imagen, aplica
   migraciones y catálogo, reinicia y espera a que el API responda sano.

Desde ahí, cada push a `main` que pase CI se despliega solo.

## 10. Landing y app (Cloudflare Pages)

_Workers & Pages → Create → Pages → Connect to Git_ → este repo. Dos proyectos:

|                  | Landing                                                                                                                                                         | App                                                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Nombre           | `fik-landing`                                                                                                                                                   | `fik-app`                                                                                                              |
| Rama             | `main`                                                                                                                                                          | `main`                                                                                                                 |
| Build command    | `pnpm exec turbo run build --filter=@finance/landing`                                                                                                           | `pnpm exec turbo run build --filter=@finance/web`                                                                      |
| Output directory | `apps/landing/dist`                                                                                                                                             | `apps/web/dist`                                                                                                        |
| Variables        | `NODE_VERSION=22` · `PNPM_VERSION=10.15.1` · `PUBLIC_API_URL=https://api.mifik.cl` · `PUBLIC_APP_URL=https://app.mifik.cl` · `PUBLIC_SITE_URL=https://mifik.cl` | `NODE_VERSION=22` · `PNPM_VERSION=10.15.1` · `VITE_API_URL=https://api.mifik.cl` · `VITE_LANDING_URL=https://mifik.cl` |
| Dominio          | _Custom domains_ → `mifik.cl`                                                                                                                                   | _Custom domains_ → `app.mifik.cl`                                                                                      |

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

## Mantenimiento

- **Logs:** Session Manager → `cd /opt/fik && sudo docker compose logs --tail 200 api`.
- **Desplegar a mano o volver a una versión anterior:** `sudo /opt/fik/deploy.sh <tag>` (los tags
  son el commit corto; ver ECR). Ojo: una migración ya aplicada no se deshace sola.
- **Respaldos:** RDS guarda 7 días con restauración a cualquier minuto. Antes de una migración
  riesgosa, tomar un _snapshot_ manual.
- **IP de Cloudflare:** volver a correr `cloudflare-sg.sh` cada pocos meses.
- **Si `prisma migrate deploy` rechaza el certificado de RDS:** `DIRECT_DATABASE_URL` verifica la
  cadena (`sslcert=/certs/rds-ca.pem&sslaccept=strict`). Prisma lee solo el **primer** certificado
  de ese archivo: con el paquete global de RDS fallaba (`P1011 ... self-signed certificate in
certificate chain`, 2026-10-11), por eso `bootstrap-ec2.sh` extrae la raíz de la región a `rds-ca.pem`. No bajarlo a
  `accept_invalid_certs` sin entender por qué falla (ruta del certificado, versión de Prisma).
- **Cambiar un secreto o agregar uno opcional** (`IPINFO_TOKEN`, `RESEND_API_KEY`):
  `aws ssm put-parameter --name /fik/prod/<NOMBRE> --type SecureString --overwrite --value ...`, y
  en el servidor `sudo bash /opt/fik/render-api-env.sh <endpoint-rds>` +
  `cd /opt/fik && sudo docker compose up -d api`.
- **Ley 21.719:** los datos quedan en Estados Unidos: antes de tener usuarios reales, aceptar con AWS el
  mecanismo de transferencia (cláusulas contractuales modelo) y declararlo en la política de
  privacidad (`.compliance/docs/21719-anexo-transferencias.md`). Lo mismo con Resend.
- **Región Santiago (o volver a São Paulo):** cuando AWS la abra, mover la base con una réplica
  entre regiones y promoverla (minutos de corte), recrear el servidor con estos scripts y cambiar la
  IP de `api` en Cloudflare.
