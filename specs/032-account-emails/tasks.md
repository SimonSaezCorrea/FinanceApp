---
description: "Task list for 032 — Correos de cuenta y de seguridad"
---

# Tasks: Correos de cuenta y de seguridad

**Input**: Design documents from `/specs/032-account-emails/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/http.md, quickstart.md

**Tests**: incluidos — la constitución exige Test-First (Principio IV): cada test se escribe antes de
su implementación y debe fallar primero.

**Organization**: por historia de usuario (spec.md). US4 (P1, probar en local) va primero porque es la
base para probar las demás; luego US1 (P1), US2 (P2), US3 (P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: paralelizable (archivos distintos, sin dependencias pendientes)
- Rutas relativas a la raíz del repo

---

## Phase 1: Setup

**Purpose**: configuración y piezas compartidas sin lógica

- [x] T001 Agregar `apps/api/.mail/` a `.gitignore` y a `.dockerignore`
- [x] T002 [P] Documentar `PUBLIC_SITE_URL`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `EMAIL_CAPTURE_DIR` y `RESEND_API_KEY` (solo producción) en `apps/api/.env.example`, y `PUBLIC_SITE_URL` + `RESEND_API_KEY` en `deploy/api.env.example`
- [x] T003 [P] Agregar los códigos `EMAIL_TOKEN_INVALID`, `EMAIL_ALREADY_VERIFIED`, `EMAIL_ALREADY_PRIMARY`, `EMAIL_RATE_LIMITED`, `EMAIL_UNAVAILABLE`, `EMAIL_NOT_FOUND`, `EMAIL_PRIMARY_NOT_DELETABLE` a `errors.*` en `packages/i18n/src/es.json` y `packages/i18n/src/en.json`, y solo `EMAIL_TOKEN_INVALID` y `EMAIL_RATE_LIMITED` (los que usa el panel de acceso) a `apps/landing/src/domains/auth/catalog/{es,en}.ts`

---

## Phase 2: Foundational (bloquea todas las historias)

**Purpose**: datos, transporte de correo, plantillas base y contrato compartido

### Datos

- [x] T004 Agregar enums `UserEmailStatus` (`PRIMARY`, `PENDING`, `PAST`) y `EmailTokenPurpose` (`VERIFY_EMAIL`, `RESET_PASSWORD`), modelos `UserEmail` (tabla `user-email`) y `EmailToken` (tabla `email-token`) y relaciones `emails`/`emailTokens` en `User` en `apps/api/prisma/schema.prisma`, según `data-model.md`
- [x] T005 Crear la migración `apps/api/prisma/migrations/<timestamp>_account_emails/migration.sql` con `prisma migrate dev --create-only`, y agregarle a mano: índices parciales únicos de `user-email` (`userId` WHERE `status='PRIMARY'` y WHERE `status='PENDING'`) y de `email-token` (`userId`, `purpose`) WHERE `"usedAt" IS NULL` y el INSERT de una fila `PRIMARY` sin confirmar por cada `user` con `email` no nulo (FR-013); aplicarla localmente y verificar que `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` no detecta diferencias
- [x] T006 [P] Test de integración de la migración y de los índices parciales (un segundo `PRIMARY` o `PENDING` para la misma cuenta falla) en `apps/api/test/integration/domains/user-email/constraints.integration.spec.ts`

### Dominio `user-email`

- [x] T007 [P] Tests unitarios de la entidad `UserEmail` (normalización de la dirección, transiciones PRIMARY/PENDING/PAST, el principal no se puede borrar) en `apps/api/test/unit/domains/user-email/user-email.entity.spec.ts`
- [x] T008 [P] Crear `apps/api/src/domains/user-email/domain/user-email.entity.ts` y `domain/errors.ts` (`EmailNotFoundError`, `EmailPrimaryNotDeletableError`, `EmailAlreadyPrimaryError`)
- [x] T009 Crear el puerto `apps/api/src/domains/user-email/domain/ports/user-email.repository.port.ts` (`listForUser`, `findPrimary`, `findPending`, `findOwned`, `createPrimaryWithTx`, `requestChangeWithTx`, `markVerifiedWithTx`, `promotePendingWithTx`, `removeOwned`, `deleteAllForUserWithTx`)
- [x] T010 Implementar `apps/api/src/domains/user-email/infrastructure/prisma-user-email.repository.ts` (actualiza en la misma transacción los espejos `user.email` y `user.emailVerified`) y `apps/api/src/domains/user-email/user-email.data.module.ts`
- [x] T011 [P] Tests de integración del repositorio (promover un pendiente deja el anterior en PAST y actualiza los espejos; `EMAIL_TAKEN` al promover una dirección que ya es principal de otra cuenta) en `apps/api/test/integration/domains/user-email/prisma-user-email.repository.integration.spec.ts`

### Dominio `email-token`

- [x] T012 [P] Tests unitarios de emisión y reglas de tokens (32 bytes base64url, hash SHA-256, vencimiento 48 h / 30 min, ventana de 60 s, límite 5/hora) en `apps/api/test/unit/domains/email-token/email-token.spec.ts`
- [x] T013 [P] Crear `apps/api/src/domains/email-token/domain/email-token.ts` (generar token, hash, vencimiento por propósito, reglas de ventana y límite) y `domain/errors.ts` (`EmailTokenInvalidError`, `EmailRateLimitedError`)
- [x] T014 Crear el puerto `apps/api/src/domains/email-token/domain/ports/email-token.repository.port.ts` (`issueWithTx` que invalida los vigentes del mismo propósito, `countRecent`, `findRecentActive`, `consume` con UPDATE condicional atómico, `deleteAllForUserWithTx`, `purgeExpired`)
- [x] T015 Implementar `apps/api/src/domains/email-token/infrastructure/prisma-email-token.repository.ts` (`issueWithTx` marca el vigente y luego inserta; un `P2002` del índice parcial se devuelve como "ya emitido", no como error) y `apps/api/src/domains/email-token/email-token.data.module.ts`
- [x] T016 [P] Test de integración del consumo atómico (dos consumos simultáneos del mismo token: exactamente uno gana; vencido y reemplazado → rechazados) y de la emisión concurrente (dos emisiones simultáneas para la misma cuenta y propósito: queda un solo enlace vigente y una sola devuelve "emitido") en `apps/api/test/integration/domains/email-token/consume.integration.spec.ts`

### `infra/email` (la carpeta pedida)

- [x] T017 [P] Tests unitarios de la elección de adaptador (`NODE_ENV=production` + clave → Resend; producción sin clave → desactivado; cualquier otro → captura) y de los valores por defecto en `apps/api/test/unit/infra/email/email.config.spec.ts`
- [x] T018 [P] Crear `apps/api/src/infra/email/email-sender.port.ts` (`OutgoingEmail { id, kind, to, locale, subject, html, text }`, `send()`, `isAvailable()`) y `apps/api/src/infra/email/email.config.ts`
- [x] T019 [P] Test unitario de `ResendEmailSender` con `fetch` simulado (cuerpo, `Authorization`, `Idempotency-Key` = id, `from`/`reply_to`, timeout, error del proveedor → excepción) en `apps/api/test/unit/infra/email/resend-email.sender.spec.ts`
- [x] T020 [P] Implementar `apps/api/src/infra/email/senders/resend-email.sender.ts`, `senders/disabled-email.sender.ts` y `senders/in-memory-email.sender.ts`
- [x] T021 [P] Test unitario de `FileCaptureEmailSender` (escribe `.html`, `.txt` y `.json` en un directorio temporal y nunca llama a la red) en `apps/api/test/unit/infra/email/file-capture-email.sender.spec.ts`
- [x] T022 [P] Implementar `apps/api/src/infra/email/senders/file-capture-email.sender.ts` (nombre `<fecha>-<kind>-<destino>`, log con la ruta y el primer enlace)
- [x] T023 Crear `apps/api/src/infra/email/email.module.ts` (global, provee `EMAIL_SENDER` según `email.config.ts`) y registrarlo en `apps/api/src/app.module.ts`
- [x] T024 [P] Tests unitarios de plantillas: paridad de claves es/en, escape HTML de todo valor interpolado, versión de texto sin HTML, ningún monto ni dato financiero en `apps/api/test/unit/infra/email/templates.spec.ts`
- [x] T025 [P] Crear `apps/api/src/infra/email/templates/escape.ts`, `templates/layout.ts` (tablas + estilos en línea, logo, pie con contacto) y `apps/api/src/infra/email/i18n/{es,en}.ts`
- [x] T026 [P] Generar el logo del correo `apps/landing/public/email/logo.png` (agregar una salida a `apps/landing/scripts/og.mjs`) y referenciarlo desde `layout.ts` con `PUBLIC_SITE_URL`

### Compartido de la cuenta

- [x] T027 Crear `apps/api/src/domains/user/application/email-links.ts` (emitir token, armar `{PUBLIC_SITE_URL}/{lang}/verify-email/?token=…` o `/reset-password/`, construir y enviar el correo con manejo de errores que solo registra) e importar `UserEmailDataModule` y `EmailTokenDataModule` en `apps/api/src/domains/user/user.module.ts`
- [x] T028 [P] Extender `CurrentUser` con `emailVerified: boolean` (el pendiente sale de `GET /auth/me/emails`), y agregar los esquemas `verifyEmailRequestSchema`, `forgotPasswordRequestSchema`, `resetPasswordRequestSchema`, `requestEmailChangeSchema`, `userEmailSchema` en `packages/contracts/src/auth/index.ts`, con tests en `packages/contracts/src/auth/emails.test.ts`
- [x] T029 Mapear los campos nuevos de `CurrentUser` en el mapper de usuario del API (`apps/api/src/domains/user/application/` donde se construye `CurrentUser`) y actualizar los fakes de `apps/api/test/unit/support/fake-ports.ts`

**Checkpoint**: datos, transporte y plantillas base listos; empiezan las historias.

---

## Phase 3: User Story 4 — Probar todos los correos en local (Priority: P1)

**Goal**: cualquier correo generado fuera de producción queda guardado localmente y nunca se entrega;
producción sin clave no rompe nada.

**Independent Test**: registrar una cuenta en local y encontrar su correo en `apps/api/.mail/` con un
enlace que funciona contra el sitio local.

- [x] T030 [P] [US4] Test e2e: con `NODE_ENV=test` el módulo usa el adaptador de captura y nada sale a la red; con el puerto sobrescrito por `InMemoryEmailSender` el test puede leer el enlace, en `apps/api/test/e2e/infra/email-delivery.http.spec.ts`
- [x] T031 [US4] Agregar el helper de e2e que sobrescribe `EMAIL_SENDER` con `InMemoryEmailSender` y extrae el token del último correo, en `apps/api/test/e2e/support/email-outbox.ts`
- [x] T032 [US4] Test unitario: con el adaptador desactivado, `email-links.ts` no lanza y expone `isAvailable() = false` para que los endpoints respondan `EMAIL_UNAVAILABLE`, en `apps/api/test/unit/domains/user/application/email-links.spec.ts`

**Checkpoint**: el flujo de correo se puede observar en local y en tests.

---

## Phase 4: User Story 1 — Confirmar que mi correo es real (Priority: P1) 🎯 MVP

**Goal**: verificación al registrarse, reenvío, cambio de correo pendiente y registro de correos en el
Perfil.

**Independent Test**: escenarios 1 y 2 de `quickstart.md`.

### Tests (primero, deben fallar)

- [x] T033 [P] [US1] Tests unitarios de `VerifyEmailHandler` (confirma el principal; promueve un pendiente y publica `EMAIL_CHANGED`; token inválido; `EMAIL_TAKEN`) en `apps/api/test/unit/domains/user/application/commands/verify-email.handler.spec.ts`
- [x] T034 [P] [US1] Tests unitarios de `ResendVerificationHandler` y `RequestEmailChangeHandler` (ventana de 60 s, límite 5/hora, `EMAIL_ALREADY_VERIFIED`, `EMAIL_ALREADY_PRIMARY`, `EMAIL_TAKEN`, un nuevo pendiente reemplaza al anterior, `EMAIL_UNAVAILABLE`) en `apps/api/test/unit/domains/user/application/commands/email-change.handlers.spec.ts`
- [x] T035 [P] [US1] Tests e2e de `POST /auth/register` (crea la fila PRIMARY y deja un correo de verificación), `POST /auth/email/verify`, `POST /auth/email/verification`, `GET/POST /auth/me/emails`, `DELETE /auth/me/emails/:id` (404 ajeno, 409 principal; borrar un pendiente invalida su enlace) y `PATCH /auth/me` rechazando `email`; además, el enlace de verificación funciona abierto con la sesión de otra cuenta, en `apps/api/test/e2e/domains/user/account-emails.http.spec.ts`

### API

- [x] T036 [US1] En `apps/api/src/domains/user/application/commands/register.handler.ts`, crear la fila `PRIMARY` (sin confirmar) en la misma transacción del registro y, después de confirmar, enviar el correo de verificación con `email-links.ts`
- [x] T037 [P] [US1] Crear `verify-email.command.ts` + `verify-email.handler.ts` (consumo atómico del token; confirmar principal o promover pendiente; publicar `AccountSecurityEvent EMAIL_CHANGED` con la dirección anterior) en `apps/api/src/domains/user/application/commands/`
- [x] T038 [P] [US1] Crear `resend-verification.command.ts` + `.handler.ts` en `apps/api/src/domains/user/application/commands/`
- [x] T039 [P] [US1] Crear `request-email-change.command.ts` + `.handler.ts` y `remove-user-email.command.ts` + `.handler.ts` en `apps/api/src/domains/user/application/commands/`
- [x] T040 [P] [US1] Crear `list-user-emails.query.ts` + `.handler.ts` en `apps/api/src/domains/user/application/queries/`
- [x] T041 [US1] Quitar `email` de `updateProfileSchema` en `packages/contracts/src/auth/index.ts` y de `apps/api/src/domains/user/application/commands/update-profile.handler.ts`
- [x] T042 [US1] Agregar a `apps/api/src/domains/user/presentation/auth.controller.ts`: `POST /auth/email/verify` (sin guard), `POST /auth/email/verification`, `GET /auth/me/emails`, `POST /auth/me/emails`, `DELETE /auth/me/emails/:id` (`ZodParamsPipe` con `rowId`)
- [x] T043 [P] [US1] Crear la plantilla `apps/api/src/infra/email/templates/verify-email.ts` (asunto, botón, vencimiento 48 h, "si no creaste esta cuenta, ignora este correo") con sus textos en `infra/email/i18n/{es,en}.ts`

### Cliente y sitio público

- [x] T044 [P] [US1] Agregar `verifyEmail`, `resendVerification`, `listEmails`, `requestEmailChange`, `removeEmail` a `packages/client/src/authApi.ts`
- [x] T045 [P] [US1] Tests de la página de verificación (saca el token de la URL, éxito, enlace inválido, sin token) en `apps/landing/src/domains/auth/scripts/verify-email.test.ts`
- [x] T046 [US1] Crear `apps/landing/src/pages/[lang]/verify-email.astro` (`noindex`) y `apps/landing/src/domains/auth/scripts/verify-email.ts`, con textos `landing.verifyEmail.*` en `apps/landing/src/i18n/{es,en}.json`, con su propio título/descripción `landing.meta.verifyEmail` (o un layout sin hreflang si no corresponde indexarla); excluir la página del sitemap y actualizar `apps/landing/test/build.test.ts`, que hoy espera exactamente diez páginas

### App

- [x] T047 [P] [US1] Tests del aviso "Confirma tu correo" (visible sin confirmar, reenviar, errores `EMAIL_RATE_LIMITED`/`EMAIL_UNAVAILABLE`) en `apps/web/src/app/EmailVerificationBanner.test.tsx`
- [x] T048 [US1] Crear `apps/web/src/app/EmailVerificationBanner.tsx` y montarlo en `apps/web/src/app/AppLayout.tsx`; textos `app.emailVerification.*` en `packages/i18n/src/{es,en}.json`
- [x] T049 [P] [US1] Tests del registro de correos en el Perfil (lista con estados, pedir cambio deja pendiente, borrar no ofrecido para el principal) en `apps/web/src/domains/profile/components/EmailHistorySection.test.tsx`
- [x] T050 [US1] Cambiar la fila de correo de `apps/web/src/domains/profile/components/PersonalInfoSection.tsx` para que pida el cambio (pendiente) en vez de editar, crear `EmailHistorySection.tsx` en la misma carpeta y su hook en `apps/web/src/domains/profile/hooks/useUserEmails.ts`; textos `profile.emails.*` en `packages/i18n/src/{es,en}.json`

**Checkpoint**: US1 completa y probable por sí sola (escenarios 1 y 2 de quickstart).

---

## Phase 5: User Story 2 — Recuperar el acceso (Priority: P2)

**Goal**: recuperación por RUT con respuesta idéntica, enlace de 30 min que cierra sesiones y no salta
el segundo factor.

**Independent Test**: escenario 3 de `quickstart.md`.

### Tests (primero)

- [x] T051 [P] [US2] Tests unitarios de `ForgotPasswordHandler` (cuenta inexistente, correo sin confirmar y límite superado no envían nada; cuenta válida envía) y `ResetPasswordHandler` (cambia el hash, cierra todas las sesiones, levanta el bloqueo de login, no toca `mfaEnabled`, publica `PASSWORD_RESET`, token inválido, y una cuenta que solo entraba con llave de acceso puede crear su contraseña) en `apps/api/test/unit/domains/user/application/commands/password-reset.handlers.spec.ts`
- [x] T052 [P] [US2] Tests e2e: `POST /auth/password/forgot` responde 202 idéntico para RUT existente, inexistente y sin confirmar; `POST /auth/password/reset` cambia la contraseña, invalida las sesiones previas (el refresh viejo falla) y exige MFA al entrar si estaba activo; la respuesta de `forgot` no espera el envío (con un `InMemoryEmailSender` lento responde igual de rápido), en `apps/api/test/e2e/domains/user/password-reset.http.spec.ts`

### API

- [x] T053 [P] [US2] Agregar `closeAllForUserWithTx(tx, userId)` a `apps/api/src/domains/session/domain/ports/session.repository.port.ts` y su implementación en `apps/api/src/domains/session/infrastructure/` (con test de integración en `apps/api/test/integration/domains/session/`)
- [x] T054 [P] [US2] Crear `forgot-password.command.ts` + `.handler.ts` (responde de inmediato; búsqueda por RUT normalizado, chequeo de correo confirmado y límite, y envío en segundo plano) en `apps/api/src/domains/user/application/commands/`
- [x] T055 [P] [US2] Crear `reset-password.command.ts` + `.handler.ts` (una `$transaction`: consumir token, nuevo hash con las reglas de contraseña, cerrar sesiones, resetear `loginFailedAttempts`/`loginLockedUntil`) en `apps/api/src/domains/user/application/commands/`
- [x] T056 [US2] Agregar `POST /auth/password/forgot` y `POST /auth/password/reset` (sin guard) a `apps/api/src/domains/user/presentation/auth.controller.ts`
- [x] T057 [P] [US2] Crear la plantilla `apps/api/src/infra/email/templates/reset-password.ts` (vencimiento 30 min, "si no lo pediste, ignora este correo; tu contraseña no cambia") con sus textos en `infra/email/i18n/{es,en}.ts`

### Sitio público

- [x] T058 [P] [US2] Agregar `forgotPassword` y `resetPassword` a `packages/client/src/authApi.ts`
- [x] T059 [P] [US2] Tests: el formulario "¿Olvidaste tu contraseña?" del panel de acceso envía el RUT y muestra siempre el mismo mensaje, en `apps/landing/src/domains/auth/components/LoginForm.test.tsx`; la página de contraseña nueva (reglas, éxito, enlace inválido) en `apps/landing/src/domains/auth/scripts/reset-password.test.ts`
- [x] T060 [US2] Reemplazar la nota de `auth.forgot` en `apps/landing/src/domains/auth/components/LoginForm.tsx` por un formulario de RUT; crear `apps/landing/src/pages/[lang]/reset-password.astro` (`noindex`, fuera del sitemap) y `apps/landing/src/domains/auth/scripts/reset-password.ts`; textos `landing.resetPassword.*` (incluido `landing.meta.resetPassword`) y `auth.forgot.*` en los catálogos es/en; incluir la página en el ajuste de `apps/landing/test/build.test.ts`

**Checkpoint**: US1 y US2 funcionan cada una por su cuenta.

---

## Phase 6: User Story 3 — Avisos de seguridad (Priority: P3)

**Goal**: un aviso por cada evento sensible, solo a correos confirmados, sin bloquear la acción.

**Independent Test**: escenario 4 de `quickstart.md`.

### Tests (primero)

- [x] T061 [P] [US3] Tests unitarios de `SendSecurityNoticeListener` (un aviso por `kind`, solo si el correo está confirmado, en el idioma de la cuenta; un error del envío se registra y no se propaga) en `apps/api/test/unit/domains/user/application/listeners/send-security-notice.listener.spec.ts`
- [x] T062 [P] [US3] Tests e2e: cada acción (cambiar contraseña, activar y desactivar MFA, confirmar y eliminar una llave, cambiar el correo, eliminar la cuenta) deja su aviso en el outbox y responde igual aunque el envío falle; al eliminar la cuenta con `keepHistory: true` no quedan filas de `user-email` ni `email-token`, en `apps/api/test/e2e/domains/user/security-notices.http.spec.ts`

### API

- [x] T063 [P] [US3] Crear `apps/api/src/domains/user/domain/events/account-security.event.ts` (`kind`, `userId`, `occurredAt`, `recipient?`, `locale?`)
- [x] T064 [P] [US3] Crear la plantilla `apps/api/src/infra/email/templates/security-notice.ts` (8 variantes: qué pasó, fecha y hora en la zona de Chile, qué hacer si no fuiste tú) con sus textos en `infra/email/i18n/{es,en}.ts`
- [x] T065 [US3] Crear `apps/api/src/domains/user/application/listeners/send-security-notice.listener.ts` y registrarlo en `apps/api/src/domains/user/user.module.ts`
- [x] T066 [US3] Publicar `AccountSecurityEvent` después del commit en `change-password.handler.ts`, `confirm-mfa-enrollment.handler.ts`, `disable-mfa.handler.ts`, `confirm-passkey-registration.handler.ts`, `remove-passkey.handler.ts` y `reset-password.handler.ts` (`apps/api/src/domains/user/application/commands/`)
- [x] T067 [US3] En `apps/api/src/domains/user/application/commands/delete-account.handler.ts`: capturar el correo principal confirmado y el idioma antes de borrar, borrar `user-email` y `email-token` en el anonimizado (`deleteAllForUserWithTx`) y publicar `ACCOUNT_DELETED` con el destinatario capturado

**Checkpoint**: las cuatro historias funcionan.

---

## Phase 7: Polish & Cross-Cutting

- [x] T068 Agregar a `apps/api/src/infra/cron/maintenance.cron.ts` el paso aislado que borra tokens vencidos o usados hace más de 7 días (`purgeExpired`), con su caso en `apps/api/test/unit/infra/cron/maintenance.cron.spec.ts`
- [x] T069 [P] Crear la fila `PRIMARY` confirmada del usuario demo en `apps/api/prisma/seed.ts`
- [x] T070 [P] Documentar en `docs/DEPLOY.md` (paso 8) `RESEND_API_KEY` y `PUBLIC_SITE_URL`, y declarar Resend como encargado de tratamiento (transferencia internacional) en `.compliance/docs/21719-anexo-transferencias.md` y `21719-dpa.md`
- [x] T071 [P] Quitar de `docs/PENDING.md` la limitación "no hay recuperación de contraseña" y registrar lo que quedó fuera (avisos por dispositivo nuevo, notificaciones financieras, preferencias de correo)
- [x] T072 Correr `pnpm typecheck`, `turbo run lint`, `pnpm format:check`, `pnpm check:boundaries` y las suites unit/integration/e2e del API más web, landing y contracts
- [x] T073 Recorrer a mano los 5 escenarios de `quickstart.md` en local y anotar el resultado
- [x] T074 Memory sync: actualizar `CLAUDE.md` (dominios `user-email`/`email-token`, `infra/email`, endpoints, variables de entorno, `PATCH /auth/me` sin `email`) y la constitución (versión + Sync Impact Report)

---

## Dependencies & Execution Order

- **Setup (Phase 1)** → **Foundational (Phase 2)** bloquea todo lo demás.
- **US4 (Phase 3)** depende de Phase 2 y desbloquea los e2e de US1–US3 (helper del outbox).
- **US1 (Phase 4)** depende de US4.
- **US2 (Phase 5)** depende de Phase 2 y US4. Funciona por sí sola, pero solo envía a correos
  confirmados, así que en la práctica se prueba después de US1.
- **US3 (Phase 6)** depende de Phase 2 y US4; T066 toca `reset-password.handler.ts` (US2) y T037
  publica `EMAIL_CHANGED` (US1), así que va al final.
- **Polish** al final.

Dentro de cada historia: tests → dominio/handlers → controller → plantillas → cliente → UI.

## Parallel Opportunities

- Phase 2: T007/T008, T012/T013, T017–T022 y T024–T026 en paralelo entre sí (archivos distintos).
- US1: T033–T035 juntos; luego T037–T040 y T043 juntos; T044–T046 en paralelo con T047–T050.
- US2: T051–T053 juntos; T054, T055 y T057 juntos; T058/T059 en paralelo.
- US3: T061–T064 juntos.

## Implementation Strategy

1. **MVP** = Phase 1 + 2 + US4 + US1: correos de verificación y registro de correos, observables en
   local. Validar con los escenarios 1 y 2 de `quickstart.md`.
2. Agregar **US2** (recuperación): escenario 3.
3. Agregar **US3** (avisos): escenario 4.
4. Polish: limpieza de tokens, documentación, cumplimiento y suites completas.
