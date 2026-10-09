# Data Model: Separar el sitio público de la aplicación (031)

Sin cambios de esquema de base de datos. Lo que cambia son valores que viajan entre el sitio, la
app y el API, y un campo opcional en un contrato existente.

## Contrato: `registerRequestSchema` (`@finance/contracts`, `auth`)

| Campo    | Tipo           | Cambio              | Regla                                                                   |
| -------- | -------------- | ------------------- | ----------------------------------------------------------------------- |
| `locale` | `"es" \| "en"` | **nuevo, opcional** | Si viene, es el idioma inicial de la cuenta; si falta, `es` (como hoy). |

`User.locale` ya existe; `RegisterHandler` lo inicializa con el valor recibido. Iniciar sesión no lo
modifica.

## Valor: ruta de retorno (`volver`)

- **Qué es**: la ruta de la app a la que la persona quería ir.
- **Forma válida**: empieza con `/`, no con `//`, sin esquema ni host; puede llevar query y hash
  (`/accounts/0191…?tab=billing`). Longitud ≤ 2048.
- **Inválida o ausente** → `/` (el Panel).
- **Dónde se valida**: al construir el enlace en la app (`landingAccessUrl`) y al usarlo en la
  landing (`safeReturnTo`) antes de `location.assign(APP_URL + volver)`.

## Valor: modo del panel (`acceso`)

- `login` | `registro`. Cualquier otro valor se ignora (el panel no se abre).

## Configuración: orígenes del API

| Variable        | Formato                                        | Default                    | Validación al arrancar                                            |
| --------------- | ---------------------------------------------- | -------------------------- | ----------------------------------------------------------------- |
| `CORS_ORIGIN`   | lista separada por comas de orígenes absolutos | `http://localhost:5173`    | cada uno es URL `http(s)://host[:port]` sin path ni barra final   |
| `PASSKEY_RP_ID` | hostname                                       | hostname del primer origen | el host de cada origen es igual al `rpId` o termina en `.${rpId}` |

## Configuración: URLs entre apps

| App     | Variable           | Uso                                                    |
| ------- | ------------------ | ------------------------------------------------------ |
| landing | `PUBLIC_API_URL`   | base del API para el panel y la comprobación de sesión |
| landing | `PUBLIC_APP_URL`   | destino tras el acceso e "Ir a la app"                 |
| landing | `PUBLIC_SITE_URL`  | base de `canonical`, `hreflang`, `og:url`, sitemap     |
| web     | `VITE_API_URL`     | (ya existe)                                            |
| web     | `VITE_LANDING_URL` | destino de acceso sin sesión y de cerrar sesión        |

## Página pública

| Atributo             | Fuente                                                               |
| -------------------- | -------------------------------------------------------------------- |
| `lang`               | segmento de la dirección (`es`, `en`)                                |
| `slug`               | `""`, `about`, `privacy`, `pricing`, `faq`                           |
| título / descripción | `landing.meta.<page>.{title,description}` del catálogo de la landing |
| canonical            | `PUBLIC_SITE_URL/{lang}/{slug}`                                      |
| alternativas         | `hreflang="es"`, `hreflang="en"`, `hreflang="x-default"` → `/`       |
| imagen OG            | `/og/cuadra-{lang}.png`                                              |
