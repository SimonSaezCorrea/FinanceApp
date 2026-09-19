# Phase 0 Research: Revocar sesiones al cambiar credenciales

Sin `[NEEDS CLARIFICATION]` pendiente de Technical Context — el spec y su clarify ya resolvieron
todo lo que hacía falta a nivel de producto. Esta investigación es sobre el código REAL a extender,
no sobre decisiones de alcance.

## Decision 1: `sid` ya llega hasta el controller, solo falta reenviarlo al comando

**Decisión**: agregar `currentSessionId: string` como tercer parámetro del constructor de
`ChangePasswordCommand` y `DisableMfaCommand`, y pasar `user.sessionId` en ambos call-sites de
`auth.controller.ts`.

**Rationale**: `JwtAuthGuard` ya arma `req.user = { id, email, sessionId: payload.sid }`
(`apps/api/src/infra/auth/jwt-auth.guard.ts`), y `@CurrentUser()` ya lo expone como `AuthUser.
sessionId` (`apps/api/src/infra/auth/current-user.decorator.ts`). El patrón exacto YA existe en este
mismo controller: `revokeOtherSessions` construye
`new RevokeOtherSessionsCommand(user.id, user.sessionId)`. No hace falta tocar el guard, el decorator
ni el JWT — es puramente reenviar un valor que el controller ya tiene en la mano.

**Alternatives considered**: leer `sid` dentro del handler contra algún contexto de request
ambient (ej. `ClsService`/`AsyncLocalStorage`) — rechazado: este repo no usa contexto ambiente en
ningún otro handler, y el patrón "el controller arma el Command con todo lo que el handler necesita"
es el único que existe hoy (specs/009 Facade pattern). Introducir uno nuevo solo para esto sería una
abstracción de un solo uso.

## Decision 2: el puerto de sesión necesita una variante `*WithTx`, siguiendo la convención `tx: unknown`

**Decisión**: agregar `closeAllExceptForUserWithTx(tx: unknown, userId: string, exceptId: string):
Promise<number>` a `SessionRepositoryPort` (`domain/ports/session.repository.port.ts`) y a
`PrismaSessionRepository` (`infrastructure/prisma-session.repository.ts`), tipando `tx` como
`unknown` y casteando `tx as PrismaService` adentro — EXACTAMENTE como ya hacen
`UserRepositoryPort.saveWithTx`/`MfaRecoveryCodeRepositoryPort.deleteAllForUserWithTx`, los dos
puertos que `DisableMfaHandler` ya combina en su propio `prisma.$transaction`.

**Rationale**: hoy `closeAllExceptForUser` es no-transaccional (`this.prisma.session.updateMany`
directo) — llamarlo DESPUÉS de que `persist()` ya confirmó el cambio de contraseña/MFA dejaría una
ventana real donde la credencial ya cambió pero la revocación puede fallar sola (justo lo que el
clarify decidió evitar con la atomicidad). El comentario actual del puerto
(`session.repository.port.ts`, líneas 5-10) afirma explícitamente que este dominio "nunca necesita
comprometerse atómicamente junto con la escritura de otra tabla" — ese comentario queda **incorrecto
por esta feature** y se corrige como parte del mismo cambio (ver `data-model.md`).

**Alternatives considered**: envolver la llamada no-transaccional existente en un try/catch manual
después del commit, revirtiendo el cambio de contraseña "a mano" si falla — rechazado: revertir un
hash de contraseña ya escrito con una segunda escritura compensatoria es exactamente el patrón que
una transacción real evita, y ya existe el patrón `*WithTx` en el mismo dominio (`user`) para este
caso — usar dos técnicas distintas para el mismo problema sería inconsistente sin necesidad.

## Decision 3: el `TContext` de ambos handlers pasa de "el agregado solo" a "agregado + sid"

**Decisión**: `ChangePasswordHandler`/`DisableMfaHandler` cambian su `TContext` de `User` a un tipo
`{ user: User; currentSessionId: string }`, poblado en `loadContext()`.

**Rationale**: `BaseCommandHandler.execute()` (`infra/cqrs/base-command.handler.ts`) llama
`persist(context, result)` — nunca recibe el `command` original. Para que `persist()` tenga el
`currentSessionId` disponible (necesario para llamar `closeAllExceptForUserWithTx`), tiene que viajar
dentro de `context`, no depender de que `persist` reciba el comando (no lo recibe, y cambiar la firma
del Template Method afectaría a los demás ~20 handlers que ya lo extienden — fuera de alcance).
Mismo patrón que `PayCreditStatementHandler`'s propio `Context` interface (que ya agrupa varios
valores más allá del agregado principal).

**Alternatives considered**: guardar `currentSessionId` como campo privado mutable del handler,
seteado en `loadContext` y leído en `persist` — rechazado: los handlers de este repo son
`@Injectable()` de NestJS con **scope por defecto (singleton)**, así que un campo de instancia
mutable es una condición de carrera real entre requests concurrentes de usuarios distintos (el
propio historial de este proyecto ya encontró y corrigió esta clase de bug — ver el hallazgo de
concurrencia de specs/021 en `verify-mfa-login.handler.ts`). Pasar el valor dentro del objeto
`TContext` que ya viaja como parámetro evita el problema por construcción.

## Decision 4: el frontend usa `FormNotice tone="warning"`, ya existente — no se crea ningún componente nuevo

**Decisión**: `ChangePasswordDialog` y `DisableMfaModal` (`SecuritySection.tsx`) agregan un
`<FormNotice tone="warning">{t("profile.security.sessions.revokeOthersWarning")}</FormNotice>`
antes de los campos del formulario.

**Rationale**: `shared/ui/form/FormNotice.tsx` ya es exactamente "la caja con borde para un aviso
que el usuario debe leer antes de enviar" (su propio doc-comment lo dice: "la caja con borde que
todo formulario de crear/editar termina necesitando"), con un tono `warning` ya implementado y
usado en otras partes de la app. No hace falta crear un componente ni una variante nueva.

**Alternatives considered**: un `ConfirmModal` de dos pasos ("¿seguro?" antes del formulario) —
rechazado: `DisableMfaModal` YA ES un `ConfirmModal` (agregar el aviso a su `description`/children es
directo); convertir `ChangePasswordDialog` (hoy un `FormSurface`) en un flujo de dos pasos sería un
cambio de UX no pedido por el spec, que solo exige que el aviso sea visible ANTES de confirmar — no
que haya una confirmación separada.

## Decision 5: invalidar la query de sesiones en el frontend tras ambas mutaciones (no pedido explícitamente, pero consistente)

**Decisión**: `changePassword`/`disableMfa` en `useProfile.ts` agregan
`onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] })` (además de su
`refreshUser()`/nada que ya tuvieran).

**Rationale**: el clarify pidió explícitamente "sin aviso posterior" — no "sin refresco". Las dos
mutaciones de sesión que YA existen (`closeSession`, `revokeOtherSessions`) invalidan
`["sessions"]` en su `onSuccess`; el usuario que cambia su contraseña o desactiva MFA está, por
construcción, parado en la misma pantalla (`SecuritySection`) donde vive la lista de sesiones — sin
esta invalidación vería sesiones que el propio backend ya cerró listadas como activas hasta que
refresque la página a mano, lo que no es "silencioso", es simplemente incorrecto.

**Alternatives considered**: no invalidar nada (dejar que el usuario refresque manualmente) —
rechazado: no fue lo que pidió el clarify (que habla de NO mostrar un aviso, no de mostrar datos
obsoletos) y rompe la consistencia con los otros dos botones de la misma sección.

## Verificación de rutas reales (corrección de discrepancia con la documentación)

`CLAUDE.md`/el spec inicial se refieren a "`PATCH /auth/me/password`" — el código real
(`auth.controller.ts`) usa `@Post("me/password")`. Esta feature no cambia el verbo HTTP (fuera de
alcance, sería un cambio de contrato no pedido); el plan y las tasks usan el verbo real (`POST`) y
se deja anotado aquí para quien lea `CLAUDE.md` después y note la discrepancia — no es un bug de esta
feature, es una imprecisión preexistente en la documentación.
