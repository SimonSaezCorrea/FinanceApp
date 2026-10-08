# Data Model: Perfil como ajustes por secciones (029)

**No hay cambios de esquema, de contrato HTTP ni de datos guardados.** Todo lo de abajo son modelos
de vista derivados en el navegador a partir de datos que ya existen (`auth.CurrentUser`, la lista de
llaves de acceso, la lista de sesiones y las estadísticas del perfil). Viven en
`apps/web/src/domains/profile/lib/profileStatus.ts` como funciones puras.

## Fuentes (existentes)

| Fuente                                | Campos usados                                                                                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.CurrentUser` (`useAuth().user`) | `mfaEnabled`, `email`, `identifierValue`, `phone`, `name`, `preferredCurrency`, `locale`, `extraCurrencies`, `hideBalances`, `memberSinceYear` |
| Llaves de acceso (`usePasskeysQuery`) | cantidad (`length`)                                                                                                                            |
| Sesiones (`useSessionsQuery`)         | `id`, `deviceLabel`, `country`, `city`, `lastUsedAt`, `closedAt`, `isCurrent`                                                                  |
| Estadísticas (`useProfileStats`)      | `accountsCount`, `monthlyMovementsCount`                                                                                                       |
| Consentimientos (`useConsentsQuery`)  | cantidad vigente (sin `revokedAt`)                                                                                                             |
| Tema (`useTheme`)                     | `mode` (`light` / `dark` / `system`)                                                                                                           |
| Soporte del navegador                 | `isPasskeySupported()` (nuevo helper, ver research R4)                                                                                         |

## ProfileSection (constante de navegación)

| Campo      | Tipo                                                                  | Notas                                                                                      |
| ---------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `key`      | `"summary" \| "personal" \| "security" \| "preferences" \| "privacy"` | Identificador interno                                                                      |
| `path`     | `string`                                                              | `""` (índice) / `personal` / `security` / `preferences` / `privacy`, relativo a `/profile` |
| `group`    | `"account" \| "app" \| "privacy"`                                     | Agrupación visible ("Tu cuenta", "App", "Privacidad")                                      |
| `titleKey` | i18n key                                                              | `profile.sections.<key>.title`                                                             |
| `icon`     | componente Lucide                                                     |                                                                                            |

Orden fijo: `summary`, `personal`, `security` (grupo `account`); `preferences` (`app`); `privacy`
(`privacy`). Agregar una sección es agregar una entrada aquí más su ruta hija (FR-007).

## ProtectionStage

| Campo       | Tipo                                     | Regla                                                                                                                                  |
| ----------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `key`       | `"password" \| "passkey" \| "twoFactor"` | Orden fijo                                                                                                                             |
| `done`      | `boolean \| null`                        | `password`: siempre `true`. `passkey`: `passkeyCount > 0`. `twoFactor`: `mfaEnabled`. `null` mientras su fuente carga o falló (FR-014) |
| `available` | `boolean`                                | `passkey`: `isPasskeySupported()`; las demás: `true`                                                                                   |
| `target`    | `string`                                 | `password` → `/profile/security#password`; `passkey` → `#passkeys`; `twoFactor` → `#two-factor`                                        |

Derivados:

- `doneCount`: etapas con `done === true` (sobre 3).
- `nextStep`: primera etapa con `done === false && available`; `null` si no hay (FR-010/010a). Si
  alguna etapa anterior está en `null` (cargando), no se calcula todavía (se muestra el estado de
  carga).

## ContactCompleteness

| Campo   | Tipo                                                                                                        | Regla                                    |
| ------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `items` | `{ key: "email" \| "identity" \| "phone"; done: boolean; editField: "email" \| "identifier" \| "phone" }[]` | `done` = el campo tiene valor (no vacío) |
| `done`  | `number`                                                                                                    | 0..3                                     |
| `total` | `3`                                                                                                         | La foto no cuenta (FR-011)               |

## SessionsPreview

| Campo         | Tipo        | Regla                                                                                    |
| ------------- | ----------- | ---------------------------------------------------------------------------------------- |
| `shown`       | `Session[]` | Abiertas (`closedAt === null`), la `isCurrent` primero, luego `lastUsedAt` desc.; máx. 3 |
| `hiddenCount` | `number`    | Abiertas que no entraron (`"y N más"`)                                                   |
| `openCount`   | `number`    | Total de abiertas                                                                        |

## SectionStatus (línea de estado de cada sección)

| Sección       | Línea de estado                                                                                              | `needsAction`                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `summary`     | "N pasos pendientes" (etapas de protección pendientes **y realizables** + datos faltantes) o "Todo en orden" | si N > 0; el indicador muestra N                                      |
| `personal`    | "Falta tu teléfono" / "Faltan N datos" / "Datos completos"                                                   | si `ContactCompleteness.done < 3`; el indicador muestra los faltantes |
| `security`    | "Dos pasos desactivada" si `!mfaEnabled`; si no, "N sesiones abiertas"                                       | si `nextStep` existe                                                  |
| `preferences` | "`{moneda}` · `{idioma}` · `{tema}`"                                                                         | nunca                                                                 |
| `privacy`     | "N consentimiento(s) vigente(s)"                                                                             | nunca                                                                 |

## Estado de UI (no persistido)

- **Sección activa**: la determina la URL (rutas hijas de `/profile`).
- **Forma**: `panes` (≥ `PROFILE_PANES_MIN_WIDTH` de contenedor) o `stack`. En `stack`, el índice
  `/profile` es la **vista inicial** = identidad + Resumen sin ajustes rápidos + lista de secciones.
- **Edición sin guardar**: en `PersonalInfoSection`, `dirty = draft[campo] !== valorGuardado`; con
  `dirty`, `useBlocker` intercepta la navegación interna (research R7). No hay persistencia de
  borradores.
