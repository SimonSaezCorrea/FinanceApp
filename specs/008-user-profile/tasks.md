---
description: "Task list for Perfil de Usuario (008-user-profile)"
---

# Tasks: Perfil de Usuario

**Input**: Design documents from `/specs/008-user-profile/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/auth-profile.md, quickstart.md

**Tests**: Incluidos — Principio IV de la constitución (Test-First / TDD) es NON-NEGOTIABLE y Vitest ya
está configurado en este repo, así que no es opcional aquí. Cada tarea de test se escribe y debe
FALLAR antes de la tarea de implementación correspondiente.

**Organization**: Tareas agrupadas por user story (spec.md) para permitir implementación y prueba
independiente de cada una.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede correr en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: A qué user story pertenece (US1..US6)

---

## Phase 1: Setup

**Purpose**: Confirmar el entorno antes de tocar código (no hay dependencias nuevas que instalar).

- [X] T001 Confirmar entorno local: `pnpm install`, `apps/api/.env` con `DATABASE_URL`/JWT secrets, Postgres accesible (`pnpm db:reset` si hace falta re-sembrar)

**Checkpoint**: Entorno listo para tocar schema y código.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infraestructura compartida por todas las user stories — schema, contrato base, punto de
entrada a `/profile`, primitivo de UI reutilizado por varias secciones.

**⚠️ CRITICAL**: Ninguna user story puede empezar hasta que esta fase esté completa.

- [X] T002 Editar `apps/api/prisma/schema.prisma`: agregar `enum UserStatus { ACTIVE DISABLED }` y a `model User` los campos `preferredCurrency String @default("CLP")`, `locale String @default("es")`, `dateFormat String @default("DD/MM/YYYY")`, `theme String @default("dark")`, `status UserStatus @default(ACTIVE)`, `createdAt DateTime @default(now())` (ver `data-model.md`)
- [X] T003 Ejecutar `pnpm --filter @finance/api exec prisma generate` y `pnpm --filter @finance/api exec prisma db push` para aplicar T002 (depends on T002)
- [X] T004 [P] Extender `packages/contracts/src/auth/index.ts`: `currentUserSchema` gana `preferredCurrency` (`z.enum(["CLP","USD","EUR"])`), `locale` (`z.enum(["es","en"])`), `dateFormat` (`z.enum(["DD/MM/YYYY","MM/DD/YYYY","YYYY-MM-DD"])`), `theme` (`z.enum(["dark","light","system"])`), `memberSinceYear` (`z.number()`) (depends on T003)
- [X] T005 [P] Agregar `update(id: string, data: Partial<...>)` a `apps/api/src/domains/auth/auth.repository.ts` (depends on T003)
- [X] T006 Actualizar `getCurrentUser` en `apps/api/src/domains/auth/auth.service.ts` para devolver los campos nuevos + `memberSinceYear` derivado de `createdAt.getFullYear()` (depends on T004, T005)
- [X] T007 [P] Crear primitivo `apps/web/src/shared/ui/switch.tsx` (knob switch controlado: `checked`, `onCheckedChange`, `disabled?`, tokens existentes, mirror de estilo de `segmented.tsx`) + casos nuevos en `apps/web/src/shared/ui/ui.test.tsx`
- [X] T008 [P] Crear `apps/web/src/domains/profile/routes/ProfileRoute.tsx` (esqueleto: `PageHeader` "Perfil" + placeholder) y registrar `{ path: "/profile", element: protect(<ProfileRoute />) }` en `apps/web/src/app/router.tsx`
- [X] T009 Editar `apps/web/src/app/AppLayout.tsx`: el bloque de usuario en el sidebar (variantes desktop colapsado/expandido y drawer móvil) pasa de texto plano a `NavLink` hacia `/profile` (depends on T008)
- [X] T010 [P] Sembrar claves `profile.title` en `apps/web/src/i18n/es.json` y `en.json`

**Checkpoint**: `/profile` es alcanzable desde el sidebar y renderiza una página vacía; schema y contrato base listos.

---

## Phase 3: User Story 1 - Ver mi perfil (Priority: P1) 🎯 MVP

**Goal**: Mostrar avatar (iniciales), nombre, email, badge de plan y 3 estadísticas reales.

**Independent Test**: Login con un usuario con cuentas/movimientos reales → clic en el bloque de usuario → ver en `/profile` los datos y estadísticas correctos.

### Tests for User Story 1 ⚠️

- [X] T011 [P] [US1] Test en `apps/api/src/domains/auth/auth.service.spec.ts`: `getCurrentUser` devuelve `memberSinceYear` correcto derivado de `createdAt` (escribir primero, debe FALLAR)
- [X] T012 [P] [US1] Test de componente `apps/web/src/domains/profile/components/ProfileCard.test.tsx`: iniciales correctas a partir del nombre, estadísticas en 0 cuando no hay datos (escribir primero, debe FALLAR)

### Implementation for User Story 1

- [X] T013 [P] [US1] Crear `apps/web/src/domains/profile/api/profileApi.ts` (reexporta/envuelve `authApi.me()`, ya trae los campos extendidos de T004/T006)
- [X] T014 [US1] Crear `apps/web/src/domains/profile/hooks/useProfile.ts`: compone `useAuth().user` + queries a `accounts` (`?status=active`, cuenta) y `transactions` (filtradas al mes en curso, cuenta) ya existentes — mismo patrón de agregación frontend-only que el Panel (depends on T013)
- [X] T015 [US1] Crear `apps/web/src/domains/profile/components/ProfileCard.tsx`: avatar iniciales, nombre, email, badge "Plan personal" (fijo), 3 stats, botón "Editar perfil" (sin acción aún, se conecta en US2) (depends on T014)
- [X] T016 [US1] Reemplazar el placeholder de `apps/web/src/domains/profile/routes/ProfileRoute.tsx` para renderizar `ProfileCard` (depends on T015)
- [X] T017 [US1] Agregar claves `profile.stats.accounts`, `profile.stats.monthlyMovements`, `profile.stats.memberSince`, `profile.plan.personal` en `es.json`/`en.json`

**Checkpoint**: US1 funcional y probable de forma independiente.

---

## Phase 4: User Story 2 - Editar nombre y email (Priority: P2)

**Goal**: Editar nombre/email desde Perfil, persistiendo y reflejando el cambio de inmediato.

**Independent Test**: Cambiar nombre/email válido → persiste y se refleja en sidebar sin recargar; email duplicado o inválido → rechazado sin persistir.

### Tests for User Story 2 ⚠️

- [X] T018 [P] [US2] Test en `auth.service.spec.ts`: `updateProfile` rechaza email en uso por otra cuenta (`EMAIL_TAKEN`), acepta rename válido, acepta re-enviar el mismo email ya propio (no-op, sin error), y mapea a `EMAIL_TAKEN` un conflicto de unicidad detectado a nivel de DB (constraint P2002) simulando una carrera entre dos cambios concurrentes al mismo email (escribir primero, debe FALLAR)
- [X] T019 [P] [US2] Test de componente para el formulario de edición: email duplicado/formato inválido muestran error, submit válido invoca la mutación (escribir primero, debe FALLAR)

### Implementation for User Story 2

- [X] T020 [P] [US2] Agregar `updateProfileRequestSchema` (`name?`, `email?`) a `packages/contracts/src/auth/index.ts`
- [X] T021 [US2] Agregar `updateProfile(userId, input)` a `auth.service.ts` (valida unicidad de email excluyendo al propio usuario vía pre-check, no-op si el email enviado es el mismo que ya tiene el usuario, usa `repo.update`; captura además el error de constraint único de Prisma (P2002) y lo mapea a `EMAIL_TAKEN` como defensa contra condición de carrera entre dos cambios concurrentes al mismo email — el pre-check por sí solo no es suficiente) (depends on T020, T005)
- [X] T022 [US2] Agregar `PATCH /auth/me` en `apps/api/src/domains/auth/auth.controller.ts` (depends on T021)
- [X] T023 [US2] Agregar `updateProfile()` a `apps/web/src/domains/profile/api/profileApi.ts` (depends on T022)
- [X] T024 [US2] Crear diálogo de edición (nuevo `apps/web/src/domains/profile/components/EditProfileDialog.tsx`, abierto desde el botón "Editar perfil" de `ProfileCard.tsx`): campos nombre/email, mutación TanStack, invalida la query `me` al guardar (depends on T023)
- [X] T025 [US2] Agregar claves `profile.edit.*` y mapeo de error `errors.EMAIL_TAKEN` (si no existe ya) en `es.json`/`en.json`

**Checkpoint**: US1+US2 funcionales.

---

## Phase 5: User Story 3 - Cambiar contraseña (Priority: P2)

**Goal**: Cambiar contraseña con verificación de la actual.

**Independent Test**: Contraseña actual correcta + nueva válida → login posterior funciona con la nueva; contraseña actual incorrecta → rechazado, contraseña original intacta.

### Tests for User Story 3 ⚠️

- [X] T026 [P] [US3] Test en `auth.service.spec.ts`: `changePassword` rechaza `currentPassword` incorrecta (`INVALID_CURRENT_PASSWORD`), acepta y persiste el nuevo hash cuando es correcta (escribir primero, debe FALLAR)

### Implementation for User Story 3

- [X] T027 [P] [US3] Agregar `changePasswordRequestSchema` (`currentPassword`, `newPassword` min 8 max 200) a `packages/contracts/src/auth/index.ts`
- [X] T028 [US3] Agregar `changePassword(userId, input)` a `auth.service.ts` (bcrypt `compare` contra `passwordHash`, luego `hash` + `repo.update`) (depends on T027)
- [X] T029 [US3] Agregar `POST /auth/me/password` (204) en `auth.controller.ts` (depends on T028)
- [X] T030 [US3] Crear `apps/web/src/domains/profile/components/SecuritySection.tsx` con la fila "Contraseña — Cambiar" (abre diálogo con contraseña actual/nueva, mutación, muestra `INVALID_CURRENT_PASSWORD`) (depends on T029, T007)
- [X] T031 [US3] Insertar `SecuritySection` en `ProfileRoute.tsx` (depends on T030, T016)
- [X] T032 [US3] Agregar claves `profile.security.password.*` y `errors.INVALID_CURRENT_PASSWORD` en `es.json`/`en.json`

**Checkpoint**: US1-3 funcionales.

---

## Phase 6: User Story 4 - Preferencias persistidas (Priority: P3)

**Goal**: Configurar y persistir moneda principal, idioma, formato de fecha y tema, asociados al usuario.

**Independent Test**: Cambiar preferencias → cerrar sesión → volver a entrar (incl. desde otro navegador) → preferencias siguen aplicadas; cambiar idioma cambia la UI de inmediato; el switch "Tema oscuro" de Perfil y el toggle del sidebar comparten el mismo estado.

### Tests for User Story 4 ⚠️

- [X] T033 [P] [US4] Test en `auth.service.spec.ts`: `updatePreferences` persiste actualizaciones parciales de `preferredCurrency`/`locale`/`dateFormat`/`theme` (escribir primero, debe FALLAR)
- [X] T034 [P] [US4] Test en `apps/web/src/theme/ThemeProvider.test.tsx`: al resolver `me()` con un `theme` de backend distinto al de `localStorage`, gana el backend y actualiza `localStorage`; al llamar `setMode`, se dispara la sincronización al backend (escribir primero, debe FALLAR)

### Implementation for User Story 4

- [X] T035 [P] [US4] Agregar `updatePreferencesRequestSchema` (todos los campos opcionales) a `packages/contracts/src/auth/index.ts`
- [X] T036 [US4] Agregar `updatePreferences(userId, input)` a `auth.service.ts` (depends on T035)
- [X] T037 [US4] Agregar `PATCH /auth/me/preferences` en `auth.controller.ts` (depends on T036)
- [X] T038 [US4] Editar `apps/web/src/theme/ThemeProvider.tsx`: al resolver el usuario autenticado, adoptar `user.theme` si difiere del local; en `setMode`, además de `localStorage`, disparar `PATCH /auth/me/preferences` en background (depends on T037)
- [X] T039 [US4] Crear `apps/web/src/domains/profile/components/PreferencesSection.tsx`: fila "Tema oscuro" (`Switch` ligado a `useTheme()`), "Moneda principal" (`Select` vía `useCurrencies()` existente), "Idioma" (`Select`, dispara cambio de idioma i18n), "Formato de fecha" (`Select`) — cada cambio llama la mutación de preferencias (depends on T038, T007)
- [X] T040 [US4] Insertar `PreferencesSection` en `ProfileRoute.tsx` (depends on T039, T016)
- [X] T041 [US4] Agregar claves `profile.preferences.*` en `es.json`/`en.json`

**Checkpoint**: US1-4 funcionales.

---

## Phase 7: User Story 5 - Desactivar mi cuenta (Priority: P4)

**Goal**: Desactivar la cuenta propia (soft-disable) con confirmación de contraseña; bloquear accesos futuros sin borrar datos.

**Independent Test**: "Eliminar cuenta" → pide contraseña → confirma → sesión termina → login posterior con esas credenciales rechazado; datos financieros intactos.

### Tests for User Story 5 ⚠️

- [X] T042 [P] [US5] Test en `auth.service.spec.ts`: `deactivate` rechaza contraseña incorrecta (`INVALID_CURRENT_PASSWORD`), marca `status = DISABLED` cuando es correcta y **no modifica ni borra** ningún registro relacionado del usuario (`BankAccount`/`Transaction`/etc. siguen existiendo e intactos tras la desactivación — FR-011); `validateCredentials` y `rotateFromRefresh` rechazan usuarios `DISABLED` (`ACCOUNT_DISABLED`) (escribir primero, debe FALLAR)
- [X] T043 [P] [US5] Test de `apps/api/src/infra/auth/jwt-auth.guard.ts`: un token de acceso válido de un usuario `DISABLED` es rechazado (escribir primero, debe FALLAR)

### Implementation for User Story 5

- [X] T044 [P] [US5] Agregar `deactivateRequestSchema` (`password`) y los error codes `ACCOUNT_DISABLED`/`INVALID_CURRENT_PASSWORD` a `packages/contracts/src/auth/index.ts`
- [X] T045 [US5] Agregar `deactivate(userId, input)` a `auth.service.ts` (bcrypt `compare`, `repo.update({status: DISABLED})` — únicamente ese campo, ninguna otra tabla/relación del usuario se toca, cumpliendo FR-011); actualizar `validateCredentials` para rechazar con `ACCOUNT_DISABLED` cuando el usuario está `DISABLED` (depends on T044)
- [X] T046 [US5] Actualizar `rotateFromRefresh` en `auth.service.ts` para rechazar (`ACCOUNT_DISABLED`) si el usuario está `DISABLED` (depends on T045)
- [X] T047 [US5] Actualizar `apps/api/src/infra/auth/jwt-auth.guard.ts`: inyectar `PrismaService`, verificar `status === ACTIVE` por cada request autenticado, rechazar si no (depends on T045)
- [X] T048 [US5] Agregar `POST /auth/me/deactivate` (204, limpia cookies igual que `logout`) en `auth.controller.ts` (depends on T045, T046, T047)
- [X] T049 [US5] Crear `apps/web/src/domains/profile/components/DangerZone.tsx`: botón "Eliminar cuenta" → `confirm-dialog.tsx` extendido con campo de contraseña → mutación → redirige a `/login` al confirmar (depends on T048)
- [X] T050 [US5] Insertar `DangerZone` en `ProfileRoute.tsx` (depends on T049, T016)
- [X] T051 [US5] Agregar claves `profile.danger.*` y `errors.ACCOUNT_DISABLED` en `es.json`/`en.json`

**Checkpoint**: US1-5 funcionales.

---

## Phase 8: User Story 6 - Placeholders 2FA/Notificaciones + Cerrar sesión (Priority: P5)

**Goal**: Completar la fidelidad visual del diseño (switches inertes) y exponer "Cerrar sesión" en Perfil.

**Independent Test**: Los 4 switches (2FA + 3 notificaciones) se ven fieles al diseño pero no persisten estado real; "Cerrar sesión" funciona igual que en el resto de la app.

### Tests for User Story 6

- [X] T052 [P] [US6] Test de componente: interactuar con los switches de 2FA/notificaciones no dispara ninguna llamada de red/mutación (escribir primero, debe FALLAR)

### Implementation for User Story 6

- [X] T053 [US6] Agregar a `SecuritySection.tsx` el switch "Verificación en dos pasos" (estado local únicamente, sin persistencia, texto "Recomendado" fiel al diseño) (depends on T031, T007)
- [X] T054 [P] [US6] Crear `apps/web/src/domains/profile/components/NotificationsSection.tsx`: 3 switches (vencimientos de cuotas, resumen mensual, alertas de gasto), estado local únicamente (depends on T007)
- [X] T055 [US6] Insertar `NotificationsSection` en `ProfileRoute.tsx`; agregar botón "Cerrar sesión" (llama `useAuth().logout()` existente) junto a `DangerZone` (depends on T054, T050)
- [X] T056 [US6] Agregar claves `profile.security.twoFactor.*`, `profile.notifications.*`, `profile.logout` en `es.json`/`en.json`

**Checkpoint**: Las 6 user stories funcionan — paridad completa con el diseño aprobado.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T057 [P] Verificar `pnpm check:boundaries` (sin imports de backend filtrados hacia `apps/web`)
- [X] T058 [P] Verificar `pnpm typecheck` en `apps/api`, `apps/web`, `packages/contracts`
- [X] T059 [P] Verificar `pnpm test` (todos los specs nuevos de T011-T052 en verde)
- [X] T060 Verificar `pnpm build` (`apps/api` + `apps/web`)
- [X] T061 Ejecutar manualmente los escenarios de `quickstart.md` de principio a fin
- [X] T062 Memory sync: si surgió alguna convención nueva durante la implementación (p. ej. el primitivo `Switch` en `shared/ui`), documentarla en `docs/{english,spanish}/DESIGN_SYSTEM.md` y/o `CLAUDE.md` en la misma sesión (Principio V)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias
- **Foundational (Phase 2)**: depende de Setup — bloquea todas las user stories
- **User Stories (Phase 3-8)**: todas dependen de Foundational; entre sí son mayormente independientes,
  pero se implementan en orden de prioridad (P1 → P2 → P2 → P3 → P4 → P5) porque cada una añade una
  sección más a la misma página (`ProfileRoute.tsx`) y comparten algunos archivos (`SecuritySection.tsx`
  se crea en US3 y se extiende en US6)
- **Polish (Phase 9)**: depende de todas las user stories que se decida incluir

### User Story Dependencies

- **US1 (P1)**: solo depende de Foundational
- **US2 (P2)**: depende de Foundational; extiende `ProfileCard.tsx` de US1 (botón "Editar perfil")
- **US3 (P2)**: depende de Foundational; independiente de US1/US2 salvo por compartir `ProfileRoute.tsx`
- **US4 (P3)**: depende de Foundational; independiente de US1-3
- **US5 (P4)**: depende de Foundational; independiente de US1-4
- **US6 (P5)**: depende de Foundational y de que exista `SecuritySection.tsx` (creado en US3) y `DangerZone.tsx` (creado en US5) para insertarse junto a ellos

### Parallel Opportunities

- T004, T005, T007, T008, T010 (Foundational) son paralelos entre sí
- Dentro de cada user story, las tareas marcadas [P] (tests entre sí, o contract+repo antes del service) son paralelas
- US1, US3 y US4 pueden implementarse en paralelo por distintos desarrolladores una vez completo Foundational (US2 conviene después de US1 por compartir `ProfileCard.tsx`; US6 conviene al final por depender de US3+US5)

---

## Parallel Example: User Story 1

```bash
Task: "Test en auth.service.spec.ts: memberSinceYear derivado de createdAt"
Task: "Test de componente ProfileCard: iniciales y stats en 0"
# luego, en paralelo:
Task: "Crear apps/web/src/domains/profile/api/profileApi.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 solamente)

1. Completar Phase 1 (Setup) + Phase 2 (Foundational)
2. Completar Phase 3 (US1)
3. **DETENER y VALIDAR**: probar US1 de forma independiente (ver `quickstart.md` §1)
4. Demo/deploy si está listo

### Incremental Delivery

1. Setup + Foundational → base lista
2. US1 → validar → demo (MVP)
3. US2 → validar → demo
4. US3 → validar → demo
5. US4 → validar → demo
6. US5 → validar → demo
7. US6 → validar → demo (paridad completa de diseño)

---

## Notes

- [P] = archivos distintos, sin dependencias pendientes
- Cada test debe escribirse y FALLAR antes de su implementación correspondiente (Principio IV)
- Commitear después de cada tarea o grupo lógico
- Detenerse en cada checkpoint para validar la historia de forma independiente
- Evitar: tareas vagas, conflictos de mismo archivo simultáneos, dependencias cruzadas entre historias que rompan su independencia

---

## Phase 10: Amendment 2026-07-15 — Información personal (FR-014..FR-018)

**Goal**: Editar país/dirección estructurada/fecha de nacimiento (edad)/identificador nacional
(tipo+valor con validación RUT), y reagrupar Cerrar sesión/Eliminar cuenta junto a la tarjeta de
información personal.

- [X] T063 Schema: `IdentifierType` enum + `User.countryId/addressStreet/addressCity/addressRegion/addressPostalCode/birthDate/identifierType/identifierValue` + `Country.users` back-relation; `prisma generate` + `db push`
- [X] T064 [P] `packages/contracts/src/auth/rut.ts`: `isValidRut` (módulo 11 chileno) + `rut.test.ts`
- [X] T065 [P] Agregar `"test": "vitest run"` + devDependency `vitest` a `packages/contracts/package.json` (no tenía suite propia); `pnpm install`
- [X] T066 Extender `currentUserSchema`/`updateProfileRequestSchema` en `packages/contracts/src/auth/index.ts` (país, dirección, `birthDate` string ISO + `age` derivado, identificador + `.refine` de RUT) + `updateProfileRequest.test.ts`
- [X] T067 `auth.repository.ts`: `findById`/`update` incluyen `country: true`
- [X] T068 `auth.service.ts`: `calculateAge`, `getCurrentUser` expone país/dirección/`age`/`birthDate`/identificador, `updateProfile` persiste los campos nuevos (depends on T063-T067)
- [X] T069 Tests `auth.service.spec.ts`: país/edad derivados, persistencia de los campos nuevos (depends on T068)
- [X] T070 `EditProfileDialog.tsx`: campos país (Select vía `useCountries()`), fecha de nacimiento (`<input type="date">`), tipo+valor de identificador, dirección estructurada (depends on T066, T068)
- [X] T071 `ProfileCard.tsx`: línea de resumen (país · edad · ciudad) cuando hay datos (depends on T070)
- [X] T072 `ProfileRoute.tsx`: mover `DangerZone` a la columna izquierda, bajo `ProfileCard` (depends on T071)
- [X] T073 i18n `profile.edit.*` (país, dirección, fecha nacimiento, identificador) + `profile.ageYears` en `es.json`/`en.json`
- [X] T074 Verificación: `pnpm check:boundaries && pnpm typecheck && pnpm --filter @finance/api test && pnpm --filter @finance/web test && pnpm --filter @finance/contracts test && pnpm build`; smoke test manual vía curl (registro → editar país/dirección/RUT/fecha nacimiento → `GET /auth/me` refleja los cambios)
- [X] T075 Seed: `seedFullUser` en `prisma/seed.ts` puebla también país/dirección/fecha nacimiento/RUT del usuario demo (Javier Torres) — no solo los datos de referencia

---

## Phase 11: Corrección — `IdentifierType` por país, no lista fija global

**Goal**: qué tipo(s) de documento soporta cada país es dato (join), no un enum global igualmente
válido en todas partes; un país puede soportar más de uno.

- [X] T076 Schema: modelo `CountryIdentifierType` (mismo patrón que `CountryCurrency`) + `Country.identifierTypes` back-relation; `prisma generate`/`db push`
- [X] T077 Seed: `IDENTIFIER_LINKS` en `seedReferenceData` (CL→RUT+PASSPORT, AR/CO/PY/PE→DNI+PASSPORT, PR→PASSPORT+OTHER)
- [X] T078 Contracts: mover `identifierTypeSchema` de `auth` a `reference`; `reference.Country` gana `identifierTypes: IdentifierType[]` (primario primero)
- [X] T079 Backend: `reference.repository.ts` incluye la relación (orderBy `isPrimary desc`); `reference.service.ts` mapea a array plano + `reference.service.spec.ts`
- [X] T080 Frontend: `EditProfileDialog.tsx` deriva las opciones de tipo de identificador del país seleccionado (fallback a lista completa sin país); auto-selecciona el tipo primario al cambiar de país si el actual ya no aplica

---

## Phase 12: Amendment 2026-07-16 — Perfil completo (`Perfil.dc.html`)

**Goal**: alinear la vista de Perfil al archivo de diseño definitivo agregado — teléfono, acordeón,
completitud de cuenta, personalización financiera (parcialmente real), y 3 secciones placeholder
fieles al diseño (Seguridad avanzada, Plan/facturación, Datos/conexiones). Ver `docs/PENDING.md` para el
detalle de qué queda diferido.

- [X] T081 Schema: `User` gana `phone`, `hideBalances`, `monthlyBudgetTarget` (Decimal), `billingCycleStartDay`, `extraCurrencies` (String[]), `budgetAlertThreshold`; `prisma generate`/`db push`
- [X] T082 [P] Contracts: extender `currentUserSchema` (todos los campos nuevos, `monthlyBudgetTarget` como `moneyString`) y `updateProfileRequestSchema` (`phone`)/`updatePreferencesRequestSchema` (financieros)
- [X] T083 Backend: `auth.service.ts` `getCurrentUser`/`updateProfile`/`updatePreferences` exponen y persisten los campos nuevos (`moneyToString` para el presupuesto) + tests en `auth.service.spec.ts`
- [X] T084 [P] `shared/ui/collapsible-section.tsx` (nuevo primitivo, cerrado por defecto) + tests en `ui.test.tsx`
- [X] T085 Convertir `PersonalInfoSection`/`PreferencesSection`/`SecuritySection`/`NotificationsSection` a `CollapsibleSection`; ajustar tests existentes para expandir la sección antes de interactuar
- [X] T086 `EditProfileDialog.tsx`: campo teléfono (junto a correo)
- [X] T087 `PersonalInfoSection.tsx`: filas nombre/correo/teléfono agregadas, botón "Editar información" al final (fiel al mockup)
- [X] T088 `AccountStatusSection.tsx` (nuevo, columna izquierda): anillo de completitud real (correo/identidad/teléfono/foto — foto siempre pendiente) + tests
- [X] T089 [P] `domains/profile/components/MaskedAmount.tsx` (nuevo primitivo) + tests; cableado real en `NetWorthCard.tsx` y `AccountVisualCard.tsx` (cobertura parcial, ver `docs/PENDING.md`)
- [X] T090 `FinancialCustomizationSection.tsx` (nuevo): ciclo mensual, presupuesto objetivo, monedas extra (multi-select real), redondeo (placeholder local), ocultar saldos (real) + tests
- [X] T091 `NotificationsSection.tsx`: slider de umbral de presupuesto (real, persistido, sin alerta real)
- [X] T092 `SecuritySection.tsx`: filas de passkey (deshabilitado) y sesiones/dispositivos (datos de ejemplo, estado local) agregadas
- [X] T093 [P] `PlanBillingSection.tsx` (nuevo, placeholder fiel al diseño)
- [X] T094 [P] `DataPrivacySection.tsx` (nuevo, placeholder fiel al diseño)
- [X] T095 `ProfileRoute.tsx`: reordenar según `Perfil.dc.html` — izquierda `ProfileCard`+`AccountStatusSection` (sticky); derecha todas las secciones colapsables + `DangerZone` al final
- [X] T096 i18n completo es/en para todo lo anterior (paridad de claves verificada por script)
- [X] T097 `docs/PENDING.md`: registro de todo lo diferido/placeholder (movido a docs/, no es específico de esta feature)
- [X] T098 Verificación final: `pnpm check:boundaries && pnpm typecheck`, suites completas (`api`/`web`/`contracts`), `pnpm build` ambos apps
