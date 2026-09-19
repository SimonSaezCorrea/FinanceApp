# Tasks: Revocar sesiones al cambiar credenciales

**Input**: Design documents from `specs/024-revoke-sessions-on-change/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/README.md

**Tests**: incluidos — este repo siempre acompaña cada handler con su suite unit/integration/e2e
(convención de todas las specs anteriores, no una excepción de esta).

**Organization**: Foundational (compartido por ambas historias) → US1 (cambio de contraseña) → US2
(desactivar MFA) → Polish. US1 y US2 son ambas P1 en el spec y, según el grafo de dependencias real
(ver "Dependencies & Execution Order"), independientes entre sí — el orden US1→US2 de este documento
es solo una RECOMENDACIÓN para un implementador solo (resolver primero el caso "desde cero" de
`ChangePasswordHandler` deja `DisableMfaHandler` como una repetición mecánica del mismo patrón ya
probado), no una dependencia que deba respetarse.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: archivo distinto de cualquier otra tarea `[P]` de su misma fase — puede asignarse a otra
  persona en paralelo, aunque declare su propio "Depende de TXXX" (ese prerequisito debe estar
  resuelto antes de que ESA tarea puntual empiece, no bloquea a las demás `[P]`)
- **[Story]**: `FOUND` (foundational), `US1`, `US2`, o `POLISH`

## Path Conventions

Monorepo existente — `apps/api/src/...`, `apps/api/test/{unit,integration,e2e}/...`,
`apps/web/src/...`. Ver `plan.md` → Project Structure para la lista completa de archivos tocados.

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: la variante transaccional del cierre de sesiones y el aviso i18n compartido — sin esto
ninguna de las dos historias puede implementarse.

**⚠️ CRITICAL**: ningún trabajo de US1/US2 puede empezar antes de terminar esta fase.

- [ ] T001 [FOUND] Agregar `closeAllExceptForUserWithTx(tx: unknown, userId: string, exceptId: string): Promise<number>`
      a `SessionRepositoryPort` en `apps/api/src/domains/session/domain/ports/session.repository.port.ts`,
      y corregir su doc-comment (líneas 5-10) que hoy afirma que este dominio nunca necesita una
      variante `*WithTx` — ver `research.md` Decision 2.
- [ ] T002 [FOUND] Implementar `closeAllExceptForUserWithTx` en
      `apps/api/src/domains/session/infrastructure/prisma-session.repository.ts` (mismo cast
      `tx as PrismaService` que `PrismaUserRepository.saveWithTx`), y reimplementar
      `closeAllExceptForUser` (no-tx) como un delegado de una línea a la variante `WithTx` pasando
      `this.prisma`, para no duplicar la query (`data-model.md`). Depende de T001.
- [ ] T003 [P] [FOUND] Test unitario del adapter: `closeAllExceptForUserWithTx` cierra las sesiones
      correctas y `closeAllExceptForUser` sigue produciendo el mismo resultado que antes (regresión) en
      `apps/api/test/unit/domains/session/infrastructure/prisma-session.repository.spec.ts` (crear si
      no existe un archivo de test de este adapter). Depende de T002.
- [ ] T004 [P] [FOUND] Agregar la clave i18n compartida `profile.security.sessions.revokeOthersWarning`
      en `apps/web/src/i18n/es.json` y `apps/web/src/i18n/en.json` (bajo `profile.security.sessions`,
      junto a las claves ya existentes de esa sección — ver `research.md` Decision 4). Verificar que
      `src/i18n/parity.test.ts` sigue en verde (exige paridad exacta de claves es/en).

**Checkpoint**: con T001-T004 completas, US1 y US2 pueden implementarse en cualquier orden.

---

## Phase 2: User Story 1 - Cambiar la contraseña cierra las demás sesiones (Priority: P1)

**Goal**: `POST /auth/me/password` exitoso cierra, en la misma transacción, todas las sesiones del
usuario excepto la que hizo el cambio.

**Independent Test**: con 2 sesiones activas (A, B), cambiar la contraseña desde A con éxito → B
queda cerrada, A sigue viva; un intento fallido (contraseña actual incorrecta) no cierra nada.

### Tests for User Story 1 ⚠️

> Escribir estos tests PRIMERO, confirmar que fallan antes de tocar el handler.

- [ ] T005 [P] [US1] Actualizar `apps/api/test/unit/domains/user/application/commands/change-password.handler.spec.ts`:
      agregar caso "llama a `closeAllExceptForUserWithTx` con el `userId` y el `currentSessionId` del
      comando dentro de la misma transacción que `repo.saveWithTx`" y caso "un fallo del puerto de
      sesión revierte el cambio de contraseña (el fake de `UserRepositoryPort.saveWithTx` no debe
      quedar confirmado)" — usar los fakes de `test/unit/support/fake-ports.ts` como referencia de
      estilo, agregando un fake de `SessionRepositoryPort` si no existe uno genérico ya reusable.
- [ ] T006 [P] [US1] Crear `apps/api/test/integration/domains/user/application/change-password.integration.spec.ts`
      (no existía uno dedicado — ver `research.md`, nota final): contra Postgres real, con 3 sesiones
      de prueba, cambiar la contraseña desde una de ellas y verificar que las otras dos quedan con
      `closedAt` seteado y la propia sigue con `closedAt: null`. El caso de atomicidad (fallo del paso
      de sesiones revierte el cambio de contraseña) NO se repite aquí — ya lo cubre T005 a nivel unit
      con un fake de `SessionRepositoryPort`, la capa correcta para inyectar un fallo (los tests de
      integración de este repo componen los adapters Prisma REALES, no mocks parciales — ver hallazgo
      U1 de `/speckit-analyze`).
- [ ] T007 [P] [US1] Crear `apps/api/test/e2e/domains/user/change-password.http.spec.ts`: escenario
      HTTP completo — login dos veces (sesión A y B), `POST /auth/me/password` con las cookies de A,
      confirmar `204`, luego confirmar que un request autenticado con las cookies de B devuelve `401`
      y uno con las de A sigue funcionando. Incluir el caso de contraseña actual incorrecta (`400
INVALID_CURRENT_PASSWORD`, ninguna sesión afectada).

### Implementation for User Story 1

- [ ] T008 [US1] En `apps/api/src/domains/user/application/commands/change-password.command.ts`,
      agregar el tercer parámetro `currentSessionId: string` al constructor.
- [ ] T009 [US1] En `apps/api/src/domains/user/presentation/auth.controller.ts`, actualizar el
      call-site de `changePassword` para pasar `user.sessionId` como tercer argumento de
      `ChangePasswordCommand` (mismo patrón que `revokeOtherSessions`, línea ~343). Depende de T008.
- [ ] T010 [US1] En `apps/api/src/domains/user/application/commands/change-password.handler.ts`:
      cambiar `TContext` de `User` a `{ user: User; currentSessionId: string }`; `loadContext` puebla
      ambos campos; inyectar `PrismaService` y `@Inject(SESSION_REPOSITORY) sessions:
SessionRepositoryPort` en el constructor (ya alcanzable — `UserModule` ya importa
      `SessionDataModule`); reescribir `persist()` para abrir `prisma.$transaction` llamando
      `this.repo.saveWithTx(tx, context.user)` y
      `this.sessions.closeAllExceptForUserWithTx(tx, context.user.id, context.currentSessionId)`.
      Depende de T001, T002, T008.
- [ ] T011 [US1] En `apps/web/src/domains/profile/components/SecuritySection.tsx`'s
      `ChangePasswordDialog`, agregar `<FormNotice tone="warning">{t("profile.security.sessions.
revokeOthersWarning")}</FormNotice>` (import de `shared/ui/form/FormNotice`) visible antes de los
      campos del formulario. Depende de T004.
- [ ] T012 [US1] En `apps/web/src/domains/profile/hooks/useProfile.ts`, agregar
      `onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] })` a la mutación
      `changePassword` (research.md Decision 5).
- [ ] T013 [P] [US1] Actualizar `apps/web/src/domains/profile/components/SecuritySection.test.tsx`:
      caso "el diálogo de cambio de contraseña muestra el aviso de cierre de sesiones antes de poder
      confirmar", más un caso negativo "tras un `changePassword.mutateAsync` exitoso, no aparece
      ningún toast/mensaje de sesiones cerradas" (SC-005, mitad "nunca posterior"). Depende de T011.

**Checkpoint**: US1 funcional y testeable de forma independiente — cambiar la contraseña ya revoca
las demás sesiones, atómicamente, con aviso previo en el frontend.

---

## Phase 3: User Story 2 - Desactivar MFA cierra las demás sesiones (Priority: P1)

**Goal**: `POST /auth/me/mfa/disable` exitoso cierra, en la misma transacción que ya usa hoy
(`DisableMfaHandler.persist()`), todas las sesiones del usuario excepto la que hizo el cambio.

**Independent Test**: con MFA activo y 2 sesiones activas (A, B), desactivar MFA desde A con éxito →
B queda cerrada, A sigue viva; una contraseña reingresada incorrecta no cierra nada ni desactiva MFA.

### Tests for User Story 2 ⚠️

- [ ] T014 [P] [US2] Actualizar `apps/api/test/unit/domains/user/application/commands/disable-mfa.handler.spec.ts`:
      agregar caso "la transacción existente también llama a `closeAllExceptForUserWithTx`" y caso "un
      fallo del puerto de sesión revierte tanto `saveWithTx` del usuario como
      `deleteAllForUserWithTx` de los códigos de recuperación" (mismo estilo que T005).
- [ ] T015 [P] [US2] Actualizar `apps/api/test/integration/domains/user/application/mfa-disable.integration.spec.ts`
      con el mismo caso de 3 sesiones de T006, adaptado a desactivar MFA — sin repetir el caso de
      atomicidad (mismo motivo que T006: ya lo cubre T014 a nivel unit).
- [ ] T016 [P] [US2] Actualizar `apps/api/test/e2e/domains/user/mfa-disable.http.spec.ts` con el mismo
      escenario HTTP de T007 (sesión A desactiva MFA, sesión B queda inválida de inmediato).

### Implementation for User Story 2

- [ ] T017 [US2] En `apps/api/src/domains/user/application/commands/disable-mfa.command.ts`, agregar
      el tercer parámetro `currentSessionId: string`.
- [ ] T018 [US2] En `apps/api/src/domains/user/presentation/auth.controller.ts`, actualizar el
      call-site de `disableMfa` para pasar `user.sessionId` como tercer argumento de
      `DisableMfaCommand`. Depende de T017.
- [ ] T019 [US2] En `apps/api/src/domains/user/application/commands/disable-mfa.handler.ts`: cambiar
      `TContext` de `User` a `{ user: User; currentSessionId: string }` (mismo shape que T010, para
      consistencia); inyectar `@Inject(SESSION_REPOSITORY) sessions: SessionRepositoryPort` en el
      constructor; agregar `await this.sessions.closeAllExceptForUserWithTx(tx, context.user.id,
context.currentSessionId)` como tercera llamada dentro del `prisma.$transaction` que este handler
      YA tiene. Depende de T001, T002, T017.
- [ ] T020 [US2] En `SecuritySection.tsx`'s `DisableMfaModal`, agregar el mismo `<FormNotice
tone="warning">` (dentro del `ConfirmModal`, dado que ya envía `description`, agregarlo como
      children antes del campo de contraseña — ver `research.md` Decision 4). Depende de T004.
- [ ] T021 [US2] En `useProfile.ts`, agregar la misma invalidación de `["sessions"]` a la mutación
      `disableMfa`.
- [ ] T022 [P] [US2] Actualizar `SecuritySection.test.tsx`: caso equivalente a T013 (aviso previo +
      caso negativo de "sin toast posterior") para el diálogo de desactivar MFA. Depende de T020.

**Checkpoint**: US1 y US2 funcionan de forma independiente — ambos disparadores revocan las demás
sesiones, atómicamente, con el mismo aviso previo.

---

## Phase 4: Polish & Cross-Cutting Concerns

- [ ] T023 [P] [POLISH] Correr `pnpm --filter @finance/api test:unit`, `test:integration`, `test:e2e`
      completos (no solo los archivos tocados) — confirmar cero regresiones en el resto de la suite.
- [ ] T024 [P] [POLISH] Correr `pnpm --filter @finance/web test` completo.
- [ ] T025 [P] [POLISH] `pnpm typecheck` y `pnpm check:boundaries` en ambos paquetes.
- [ ] T026 [POLISH] Ejecutar manualmente los 2 escenarios HTTP de `quickstart.md` contra la API real
      (login doble, cambio de contraseña / desactivar MFA, confirmar que la otra sesión queda inválida).
- [ ] T027 [POLISH] Actualizar `docs/PENDING.md`, sección "Perfil de usuario" ítem 4 (Sesiones y
      dispositivos): la limitación "cambiar la contraseña o desactivar MFA no revocan las demás
      sesiones" queda resuelta — reemplazar por la nota de qué SIGUE pendiente (notificación de nuevo
      dispositivo, límite de sesiones simultáneas, revocación por comportamiento sospechoso, correo de
      aviso — ninguno de estos se implementa aquí). Nota de cobertura (hallazgo G1 de
      `/speckit-analyze`): FR-006 ("no enviar correo/notificación") no tiene tarea de implementación
      propia porque se satisface por ausencia total de `EmailPort` en el proyecto — no hay ningún
      camino de código que pudiera enviar ese correo. Dejar esto dicho explícitamente en el propio
      texto de `docs/PENDING.md` para que quede trazado, no asumido.
- [ ] T028 [POLISH] Memory sync: actualizar `CLAUDE.md` a mano (NO con el hook genérico de
      agent-context, ver `plan.md`) agregando la entrada "Current plan (024 — implementado): ..." con
      los resultados reales de test, y degradando la entrada 023 actual a "Prior plan: ..." — mismo
      formato que toda spec anterior. Actualizar `.specify/memory/constitution.md` solo si surgió algún
      principio nuevo durante la implementación (no se anticipa ninguno — ver Constitution Check de
      `plan.md`).

---

## Dependencies & Execution Order

- **Foundational (Phase 1)**: sin dependencias externas — bloquea US1 y US2 por completo (ambas
  necesitan `closeAllExceptForUserWithTx` y la clave i18n).
- **US1 (Phase 2)** y **US2 (Phase 3)**: ambas dependen solo de Foundational, no entre sí — pueden
  implementarse en cualquier orden o en paralelo por dos personas distintas (tocan archivos
  disjuntos: `change-password.*` vs `disable-mfa.*`, y zonas distintas de `SecuritySection.tsx`/
  `useProfile.ts` aunque compartan el archivo — ver nota de conflicto abajo).
- **Polish (Phase 4)**: depende de que US1 y US2 estén ambas completas.

### Nota sobre "mismo archivo, distinta zona"

`SecuritySection.tsx` y `useProfile.ts` son tocados por AMBAS historias (T011/T020, T012/T021) en
funciones/objetos distintos del mismo archivo — no se marcan `[P]` entre sí para evitar que dos
ediciones concurrentes al mismo archivo pisen sus propios cambios, aunque conceptualmente sean
independientes.

### Parallel Example: Foundational

```bash
# T003 y T004 pueden correr en paralelo una vez T001-T002 están hechas (T003 depende de T002; T004 es independiente):
Task: "Test unitario del adapter de sesión en apps/api/test/unit/domains/session/infrastructure/prisma-session.repository.spec.ts"
Task: "Agregar clave i18n profile.security.sessions.revokeOthersWarning en es.json y en.json"
```

### Parallel Example: User Story 1 (tests)

```bash
Task: "change-password.handler.spec.ts — casos de revocación y atomicidad"
Task: "change-password.integration.spec.ts — nuevo, contra Postgres real"
Task: "change-password.http.spec.ts — escenario e2e completo"
```

---

## Implementation Strategy

### MVP First (User Story 1 sola)

1. Completar Phase 1 (Foundational).
2. Completar Phase 2 (US1 — cambio de contraseña).
3. **Parar y validar**: correr el escenario 1 de `quickstart.md` manualmente.
4. Esto ya es demostrable — MFA sigue sin revocar (US2 pendiente), pero el cambio de contraseña ya
   revoca sesiones de punta a punta.

### Entrega incremental

1. Foundational → base lista.
2. US1 → probar independientemente → (opcional) demo.
3. US2 → probar independientemente → (opcional) demo.
4. Polish → suite completa + memory sync.

## Notes

- `[P]` = archivo distinto de otras tareas `[P]` de su misma fase (ver definición completa arriba).
- Cada tarea de test debe escribirse y **fallar** antes de tocar el código de implementación
  correspondiente (T005-T007 antes de T008-T012; T014-T016 antes de T017-T021).
- Commitear después de cada tarea o grupo lógico, no acumular todo el feature en un solo commit.
