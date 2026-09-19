# Tasks: Renombrar passkeys y autocompletado condicional

**Input**: Design documents from `specs/025-passkey-management/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/README.md

**Tests**: incluidos, misma convención de siempre en este repo.

**Organization**: US1 (renombrar) y US2 (autocompletado condicional) son independientes entre sí —
tocan archivos disjuntos por completo (backend `passkey`/`user` vs. frontend
`webauthn.ts`/`useAuth.tsx`/`LoginRoute.tsx`).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: archivo distinto de otras tareas `[P]` de su misma fase.
- **[Story]**: `US1`, `US2`, o `POLISH`.

---

## Phase 1: User Story 1 - Renombrar una llave de acceso (Priority: P1)

**Goal**: `PATCH /auth/me/passkeys/:id` cambia el nombre de una llave propia.

**Independent Test**: renombrar una llave propia, verificar el nuevo nombre en la lista y que
`lastUsedAt` no cambió; intentar renombrar una ajena/inexistente → 404.

### Implementation for User Story 1

- [X] T001 [US1] Agregar `renameOwned(userId, id, name): Promise<PasskeyProps | null>` a
      `PasskeyRepositoryPort` en `apps/api/src/domains/passkey/domain/ports/passkey.repository.port.ts`.
- [X] T002 [US1] Implementar `renameOwned` en
      `apps/api/src/domains/passkey/infrastructure/prisma-passkey.repository.ts` (`updateMany` por
      `{id, userId}`, `null` si `count === 0`). Depende de T001.
- [X] T003 [P] [US1] Agregar `renamePasskeyRequestSchema` a `packages/contracts/src/auth/index.ts`
      (`z.object({ name: z.string().trim().min(1).max(60) })`, junto a los demás schemas de passkey).
- [X] T004 [US1] Crear `apps/api/src/domains/user/application/commands/rename-passkey.command.ts`
      (`RenamePasskeyCommand(userId, passkeyId, name)`).
- [X] T005 [US1] Crear `apps/api/src/domains/user/application/commands/rename-passkey.handler.ts`
      (mirror de `remove-passkey.handler.ts`: `loadContext` → `null`, `handle` llama
      `renameOwned` y lanza `PasskeyNotFoundError` si `null`). Depende de T001, T002, T004.
- [X] T006 [US1] Agregar `PATCH me/passkeys/:id` en
      `apps/api/src/domains/user/presentation/auth.controller.ts` (después de `removePasskey`,
      mismo `passkeyIdParamsSchema`, nuevo `renamePasskeyRequestSchema` en el body). Depende de T003,
      T005.

### Tests for User Story 1

- [X] T007 [P] [US1] Crear
      `apps/api/test/unit/domains/user/application/commands/rename-passkey.handler.spec.ts`: caso
      éxito (nombre nuevo devuelto), caso `PasskeyNotFoundError` cuando el puerto devuelve `null`.
- [X] T008 [P] [US1] Crear
      `apps/api/test/integration/domains/passkey/infrastructure/rename.integration.spec.ts`: contra
      Postgres real, renombrar una llave propia y verificar el cambio; intentar renombrar la de OTRO
      usuario y verificar que devuelve `null` sin tocarla.
- [X] T009 [P] [US1] Actualizar `apps/api/test/e2e/domains/user/passkey-management.http.spec.ts`: +
      caso `PATCH .../:id` exitoso, + caso 404 con id ajeno/inexistente, + caso 400 con nombre vacío.

### Frontend for User Story 1

- [X] T010 [US1] Agregar `rename(id, name)` a `apps/web/src/domains/auth/api/passkeyApi.ts`
      (`PATCH /auth/me/passkeys/:id`, body `{name}`).
- [X] T011 [US1] Agregar mutación `renamePasskey` en
      `apps/web/src/domains/profile/hooks/useProfile.ts` (invalida `["passkeys"]` en éxito, mismo
      patrón que `removePasskey`). Depende de T010.
- [X] T012 [US1] En `apps/web/src/domains/profile/components/PasskeySection.tsx`: agregar un botón
      "lápiz" (ícono `Pencil` de lucide-react) junto al de eliminar en cada fila; al clickearlo, esa
      fila entra en modo edición inline (input + check/cancelar) en vez de mostrar el nombre —
      research.md Decision 4. Depende de T011.
- [X] T013 [P] [US1] Agregar claves i18n `profile.security.passkey.rename` (botón/aria-label) y
      reutilizar `save`/`cancel` ya existentes, en `apps/web/src/i18n/{es,en}.json`.
- [X] T014 [P] [US1] Agregar casos a
      `apps/web/src/domains/profile/components/PasskeySection.test.tsx`: renombrar una llave llama a
      la mutación con el nuevo nombre; un 404 simulado muestra el error sin perder el nombre
      anterior en pantalla. Depende de T012.

**Checkpoint**: US1 funcional e independiente — renombrar una llave funciona de punta a punta.

---

## Phase 2: User Story 2 - Autocompletado condicional en login (Priority: P2)

**Goal**: en navegadores compatibles, el navegador sugiere la passkey del usuario sobre el campo de
email de login sin apretar ningún botón.

**Independent Test**: en un navegador con soporte, enfocar el campo de email con una passkey
registrada → aparece como sugerencia; elegirla completa el login. En uno sin soporte, no pasa nada
distinto a hoy.

### Implementation for User Story 2

- [X] T015 [US2] En `apps/web/src/shared/lib/webauthn.ts`: agregar una variante de `toGetOptions` que
      incluya `mediation: "conditional"` en las opciones que se le pasan a
      `navigator.credentials.get()` (o un parámetro opcional en la función existente).
- [X] T016 [US2] En `apps/web/src/domains/auth/hooks/useAuth.tsx`: agregar
      `tryConditionalPasskeyLogin(signal: AbortSignal)` — feature-detecta
      `PublicKeyCredential.isConditionalMediationAvailable`, si está disponible pide
      `passkeyApi.startLogin({})` (sin email) y llama `navigator.credentials.get({mediation:
"conditional", publicKey: options, signal})`; al resolver, verifica igual que
      `loginWithPasskey` (`passkeyApi.verifyLogin` + `setUser`). Depende de T015.
- [X] T017 [US2] En `apps/web/src/domains/auth/routes/LoginRoute.tsx`: cambiar el `autoComplete` del
      campo de email a `"username webauthn"`; agregar un `useEffect` al montar que cree un
      `AbortController` y llame `tryConditionalPasskeyLogin(controller.signal)`, con `controller.
abort()` en el cleanup del efecto. Depende de T016.
- [X] T018 [US2] En el mismo componente, abortar el `AbortController` de la ceremonia condicional
      justo antes de enviar el formulario de contraseña (para que nunca compitan). Depende de T017.

### Tests for User Story 2

- [X] T019 [P] [US2] Agregar casos a `apps/web/src/domains/auth/routes/LoginRoute.test.tsx`: con
      `isConditionalMediationAvailable` mockeado `true`, se llama `navigator.credentials.get` con
      `mediation:"conditional"` al montar; con `false` (o sin la API), NO se llama en absoluto y no
      se lanza ningún error; y un caso de regresión — el botón explícito "Iniciar sesión con llave de
      acceso" sigue completando el login igual que antes, sin verse afectado por el nuevo `useEffect`
      (FR-006). Depende de T017, T018.

**Checkpoint**: US1 y US2 funcionan de forma independiente.

---

## Phase 3: Polish & Cross-Cutting Concerns

- [X] T020 [P] [POLISH] Correr `pnpm --filter @finance/api test:unit`, `test:integration`,
      `test:e2e` completos.
- [X] T021 [P] [POLISH] Correr `pnpm --filter @finance/web test` completo.
- [X] T022 [P] [POLISH] `pnpm typecheck`, `pnpm lint` y `pnpm check:boundaries` en ambos paquetes.
- [X] T023 [POLISH] Validar manualmente el Escenario 1 de `quickstart.md` con `curl` contra la API
      real. El Escenario 2 (autocompletado condicional) requiere un navegador real con un
      autenticador — dejar documentado como no verificado si este entorno no tiene esa herramienta.
- [X] T024 [POLISH] Actualizar `docs/PENDING.md`, sección "Perfil de usuario" ítem 3 (Passkey): quitar
      "renombrar" y "autocompletado condicional" de la lista de pendientes — solo queda la
      verificación de attestation FIDO MDS, explícitamente fuera de alcance.
- [X] T025 [POLISH] Memory sync manual de `CLAUDE.md` (nunca con el hook genérico de agent-context —
      ver la nota de specs/024): nueva entrada "Current plan (025 — implementado)", degradar 024 a
      "Prior plan", agregar un Amendment al bullet del dominio `passkey`/`user` sobre el nuevo método
      del puerto y el autocompletado condicional.

---

## Dependencies & Execution Order

- **US1 (Phase 1)** y **US2 (Phase 2)**: sin dependencias entre sí — archivos completamente
  disjuntos, pueden hacerse en cualquier orden o en paralelo.
- **Polish (Phase 3)**: depende de que ambas historias estén completas.

## Notes

- T019 depende de que T017/T018 ya existan porque el test necesita el componente ya cableado para
  mockear `navigator.credentials.get`/`isConditionalMediationAvailable` sobre su comportamiento real.
- Commitear después de cada historia completa.
