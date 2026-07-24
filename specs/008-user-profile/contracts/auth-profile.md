# Contracts: Perfil de Usuario (extensión del dominio `auth`)

Todos los endpoints están bajo el prefijo global `/api/v1`, protegidos por `JwtAuthGuard`
(`@CurrentUser`), y siguen el formato de error existente `{ error: { code, field? } }`.

## `GET /auth/me` (existente, contrato ampliado)

Respuesta `CurrentUser` ampliada:

```ts
{
  id: string;
  email: string | null;
  name: string | null;
  preferredCurrency: "CLP" | "USD" | "EUR";
  locale: "es" | "en";
  dateFormat: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
  theme: "dark" | "light" | "system";
  memberSinceYear: number;
}
```

## `PATCH /auth/me` — editar nombre/email

**Request** (`updateProfileRequestSchema`):

```ts
{ name?: string; email?: string }
```

**Response**: `CurrentUser` (actualizado).

**Errors**: `EMAIL_TAKEN` (field: `email`) si el email ya pertenece a otra cuenta;
`VALIDATION_ERROR` si el formato es inválido (manejado por `ZodValidationPipe`).

## `POST /auth/me/password` — cambiar contraseña

**Request** (`changePasswordRequestSchema`):

```ts
{
  currentPassword: string;
  newPassword: string; /* min 8, max 200, igual que registro */
}
```

**Response**: `204 No Content`.

**Errors**: `INVALID_CURRENT_PASSWORD` (401) si `currentPassword` no coincide.

## `PATCH /auth/me/preferences` — moneda/idioma/formato de fecha/tema

**Request** (`updatePreferencesRequestSchema`, todos opcionales — actualización parcial):

```ts
{
  preferredCurrency?: "CLP" | "USD" | "EUR";
  locale?: "es" | "en";
  dateFormat?: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
  theme?: "dark" | "light" | "system";
}
```

**Response**: `CurrentUser` (actualizado).

## `POST /auth/me/deactivate` — desactivar cuenta

**Request** (`deactivateRequestSchema`):

```ts
{
  password: string;
} // reingreso de la contraseña actual, obligatorio
```

**Response**: `204 No Content` + limpia las cookies de sesión (mismo efecto que `POST /auth/logout`).

**Errors**: `INVALID_CURRENT_PASSWORD` (401) si `password` no coincide.

**Efecto secundario**: `User.status = DISABLED`. A partir de ese momento:

- `POST /auth/login` con esas credenciales responde `UnauthorizedException({ code: "ACCOUNT_DISABLED" })`,
  incluso con la contraseña correcta.
- `JwtAuthGuard` y `rotateFromRefresh` rechazan (401) cualquier request autenticado de esa cuenta a
  partir de su siguiente verificación contra la DB.

## Nuevos error codes (agnósticos de idioma, mapeados en `errors.<CODE>` de es/en)

- `INVALID_CURRENT_PASSWORD` — la contraseña actual provista no coincide (change-password, deactivate).
- `ACCOUNT_DISABLED` — intento de login/acceso sobre una cuenta desactivada.

(`EMAIL_TAKEN` ya existe y se reutiliza tal cual para `PATCH /auth/me`.)
