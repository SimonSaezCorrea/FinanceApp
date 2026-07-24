# Data Model: Perfil de Usuario

## `User` (extendido — `apps/api/prisma/schema.prisma`)

Tabla existente (`@@map("user")`); no se crea entidad nueva. Campos que esta feature agrega:

| Campo               | Tipo                      | Default        | Notas                                                                                     |
| ------------------- | ------------------------- | -------------- | ----------------------------------------------------------------------------------------- |
| `preferredCurrency` | `String`                  | `"CLP"`        | Código ISO 4217 de 3 letras, mismo patrón que `BankAccount.currency`.                     |
| `locale`            | `String`                  | `"es"`         | `"es"` \| `"en"` (validado en el contrato zod, no a nivel de Prisma).                     |
| `dateFormat`        | `String`                  | `"DD/MM/YYYY"` | Uno de un set fijo (`DD/MM/YYYY`, `MM/DD/YYYY`, `YYYY-MM-DD`).                            |
| `theme`             | `String`                  | `"dark"`       | `"dark"` \| `"light"` \| `"system"` — mismo dominio que `ThemeMode` ya usado client-side. |
| `status`            | `UserStatus` (enum nuevo) | `ACTIVE`       | `ACTIVE` \| `DISABLED`. `DISABLED` bloquea login y guard.                                 |
| `createdAt`         | `DateTime`                | `now()`        | Fuente de "miembro desde" (`memberSinceYear` derivado en el contrato).                    |

```prisma
enum UserStatus {
  ACTIVE
  DISABLED
}

model User {
  id                String     @id @default(cuid())
  name              String?
  email             String?    @unique
  emailVerified     DateTime?
  image             String?
  passwordHash      String?
  preferredCurrency String     @default("CLP")
  locale            String     @default("es")
  dateFormat        String     @default("DD/MM/YYYY")
  theme             String     @default("dark")
  status            UserStatus @default(ACTIVE)
  createdAt         DateTime   @default(now())

  // ...relaciones existentes sin cambios...

  @@map("user")
}
```

No se toca `emailVerified`/`image` (restos muertos de NextAuth, fuera de alcance de esta feature).

## Amendment 2026-07-15 — Información personal (FR-014..FR-018)

| Campo               | Tipo                           | Default | Notas                                                                                                                                                                 |
| ------------------- | ------------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `countryId`         | `String?` (FK)                 | `null`  | → `Country.id` (tabla `reference` ya existente, `onDelete: SetNull`). Back-relation `Country.users User[]`.                                                           |
| `addressStreet`     | `String?`                      | `null`  | Calle y número, texto libre.                                                                                                                                          |
| `addressCity`       | `String?`                      | `null`  | Ciudad/comuna, texto libre.                                                                                                                                           |
| `addressRegion`     | `String?`                      | `null`  | Región/estado, texto libre.                                                                                                                                           |
| `addressPostalCode` | `String?`                      | `null`  | Código postal, texto libre.                                                                                                                                           |
| `birthDate`         | `DateTime?`                    | `null`  | Fecha exacta almacenada; el contrato expone tanto `birthDate` (string ISO, para hidratar el form de edición) como `age` (derivado, para la vista principal — FR-016). |
| `identifierType`    | `IdentifierType?` (enum nuevo) | `null`  | `RUT` \| `DNI` \| `PASSPORT` \| `OTHER`.                                                                                                                              |
| `identifierValue`   | `String?`                      | `null`  | Validado con dígito verificador (módulo 11) solo cuando `identifierType === "RUT"` (FR-015).                                                                          |

```prisma
enum IdentifierType {
  RUT
  DNI
  PASSPORT
  OTHER
}

model User {
  // ...campos previos...
  countryId         String?
  addressStreet     String?
  addressCity       String?
  addressRegion     String?
  addressPostalCode String?
  birthDate         DateTime?
  identifierType    IdentifierType?
  identifierValue   String?

  country Country? @relation(fields: [countryId], references: [id], onDelete: SetNull)
  // ...relaciones previas...
}
```

Validación de `identifierValue` (RUT): `isValidRut()` en `packages/contracts/src/auth/rut.ts` (algoritmo
módulo 11 chileno), invocado desde un `.refine()` en `updateProfileRequestSchema` — solo corre cuando
`identifierType === "RUT"`; para `DNI`/`PASSPORT`/`OTHER` no hay validación de formato (varía por país,
sin librería universal disponible).

Todos los campos de esta sección son opcionales (FR-017); no hay lógica de negocio real que los consuma
hoy (son puramente informativos — no existe facturación/KYC en la app).

## Validación / reglas

- `preferredCurrency`: exactamente 3 caracteres, se recomienda restringir a los valores que ya maneja
  la app (CLP/USD/EUR) a nivel de contrato (`z.enum(["CLP", "USD", "EUR"])`), consistente con
  "moneda multi-divisa: CLP principal, USD, EUR" del design handoff.
- `locale`: `z.enum(["es", "en"])`.
- `dateFormat`: `z.enum(["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"])`.
- `theme`: `z.enum(["dark", "light", "system"])` — mismo dominio que `ThemeMode` (`apps/web/src/theme/useTheme.ts`).
- `status`: no editable directamente por el usuario vía `updatePreferences`; solo cambia a `DISABLED`
  a través del flujo dedicado de desactivación (contraseña + confirmación).
- Cambio de contraseña: requiere `currentPassword` (verificada con `compare` de bcryptjs contra
  `passwordHash`) + `newPassword` (mismas reglas que registro: `min(8).max(200)`).
- Cambio de email: `z.string().email()` + unicidad (`findByEmail` ya existe en `AuthRepository`,
  excluyendo al propio usuario).

## Derivados expuestos en el contrato (no almacenados)

- `memberSinceYear`: `createdAt.getFullYear()`, calculado en `getCurrentUser`/`AuthService`.
- Estadísticas (cuentas activas, movimientos del mes) NO forman parte de este modelo — se calculan en
  el frontend combinando datos ya expuestos por `accounts` y `transactions` (ver `research.md` §5).

## Estados

`UserStatus`: `ACTIVE → DISABLED` (unidireccional en esta feature; no hay flujo de reactivación
self-service — ver Assumptions en `spec.md`).

## Corrección 2026-07-15 — `IdentifierType` por país, no lista fija global

El diseño inicial de esta sección trataba `IdentifierType` como una lista fija global (RUT/DNI/
PASSPORT/OTHER) igualmente válida en cualquier país. Corregido: qué tipo(s) soporta cada país es
**dato**, no algo fijo — un país puede soportar más de uno (ej. Chile: RUT + Pasaporte).

```prisma
model CountryIdentifierType {
  id             String         @id @default(cuid())
  countryId      String
  identifierType IdentifierType
  isPrimary      Boolean        @default(false)

  country Country @relation(fields: [countryId], references: [id], onDelete: Cascade)

  @@unique([countryId, identifierType])
  @@map("country-identifier-type")
}
```

Mismo patrón exacto que `CountryCurrency` (`Country ↔ Currency`). `reference.Country` expone
`identifierTypes: IdentifierType[]` (primario primero). `identifierTypeSchema` se movió de
`packages/contracts/src/auth` a `packages/contracts/src/reference` (es vocabulario de referencia,
no específico de auth). El formulario de edición del frontend deriva sus opciones del país
seleccionado, con fallback a la lista completa si no hay país (datos existentes previos a esta
corrección). Sembrado en `prisma/seed.ts` con el mismo patrón que los `LINKS` de moneda:
CL→RUT+PASSPORT, AR/CO/PY/PE→DNI+PASSPORT, PR→PASSPORT+OTHER.

## Amendment 2026-07-16 — Perfil completo (`Perfil.dc.html`)

| Campo                  | Tipo       | Default | Notas                                                                         |
| ---------------------- | ---------- | ------- | ----------------------------------------------------------------------------- |
| `phone`                | `String?`  | `null`  | Texto libre.                                                                  |
| `hideBalances`         | `Boolean`  | `false` | Real — enmascara montos vía `MaskedAmount` (cobertura parcial, `PENDING.md`). |
| `monthlyBudgetTarget`  | `Decimal?` | `null`  | Dinero — cruza el límite como `moneyString`, igual que el resto de la app.    |
| `billingCycleStartDay` | `Int?`     | `null`  | Día 1-28. No conectado al cálculo de "mes actual" del Panel todavía.          |
| `extraCurrencies`      | `String[]` | `[]`    | Subconjunto de `CLP\|USD\|EUR`. Selección sin conversión en vivo.             |
| `budgetAlertThreshold` | `Int?`     | `80`    | % 1-100. Usado solo por el slider de Notificaciones, sin alerta real.         |

`identifierTypeSchema`/`preferredCurrencySchema` reutilizados para `extraCurrencies`. Ver
`PENDING.md` para qué de "Personalización financiera"/"Estado de tu cuenta" es real vs. placeholder,
y qué secciones completas (Seguridad avanzada, Plan/facturación, Datos/conexiones) son placeholders
fieles al diseño sin ningún backend detrás.
