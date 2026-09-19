# Phase 1 Data Model: Revocar sesiones al cambiar credenciales

## Sin entidades ni columnas nuevas

Esta feature **no toca `schema.prisma`** — no hay migración, no hay `db push` que regenere nada.
`Session` (specs/023) queda exactamente como está: `id`, `userId`, `deviceLabel`, `country`, `city`,
`expiresAt`, `lastUsedAt`, `closedAt`. El "cierre" que esta feature dispara es el mismo que ya existe
(estampar `closedAt`), no un estado nuevo.

## Comandos modificados (forma, no persistencia)

### `ChangePasswordCommand`

```ts
export class ChangePasswordCommand implements UserScopedCommand {
  readonly scope = "user" as const;
  constructor(
    public readonly userId: string,
    public readonly input: auth.ChangePasswordRequest,
    public readonly currentSessionId: string, // NUEVO — el `sid` de quien hace el cambio
  ) {}
}
```

### `DisableMfaCommand`

```ts
export class DisableMfaCommand implements UserScopedCommand {
  readonly scope = "user" as const;
  constructor(
    public readonly userId: string,
    public readonly input: auth.DisableMfaRequest,
    public readonly currentSessionId: string, // NUEVO — mismo campo, mismo origen
  ) {}
}
```

Ninguno de los dos es un cambio de contrato HTTP público — `currentSessionId` no viaja en el body de
la request (viene de `AuthUser.sessionId`, resuelto por `JwtAuthGuard`), así que
`packages/contracts`'s `changePasswordRequestSchema`/`disableMfaRequestSchema` quedan intactos.

## Contexto interno de los handlers (`TContext`)

Ambos handlers cambian su `TContext` genérico de `User` a:

```ts
interface Context {
  user: User;
  currentSessionId: string;
}
```

Ver `research.md` Decision 3 para por qué esto vive en el contexto y no en un campo de instancia del
handler (los handlers son singletons de Nest — un campo mutable sería una condición de carrera entre
requests concurrentes de usuarios distintos).

## Puerto extendido: `SessionRepositoryPort`

`apps/api/src/domains/session/domain/ports/session.repository.port.ts` gana un método:

```ts
/**
 * Variante transaccional de `closeAllExceptForUser` — necesaria desde specs/024, que cierra
 * las demás sesiones del usuario DENTRO de la misma transacción que un cambio de contraseña o
 * una desactivación de MFA (si el cierre falla, todo el cambio se revierte). El doc-comment
 * anterior de este archivo afirmaba que este dominio nunca necesitaría una variante `*WithTx`
 * — quedó desactualizado por este mismo cambio.
 */
closeAllExceptForUserWithTx(tx: unknown, userId: string, exceptId: string): Promise<number>;
```

Implementación en `PrismaSessionRepository` (mismo cast `tx as PrismaService` que el resto del
repo — ver research.md Decision 2):

```ts
async closeAllExceptForUserWithTx(tx: unknown, userId: string, exceptId: string): Promise<number> {
  const client = tx as PrismaService;
  const result = await client.session.updateMany({
    where: { userId, id: { not: exceptId }, closedAt: null },
    data: { closedAt: new Date() },
  });
  return result.count;
}
```

`closeAllExceptForUser` (la variante no-transaccional, usada hoy por `RevokeOtherSessionsHandler`)
se reimplementa como un delegado de una línea a la variante `WithTx`, pasándole `this.prisma`, para
no duplicar la query en dos lugares:

```ts
async closeAllExceptForUser(userId: string, exceptId: string): Promise<number> {
  return this.closeAllExceptForUserWithTx(this.prisma, userId, exceptId);
}
```

## Sin cambios en `packages/contracts`

Ninguna forma de request/response pública cambia. Ver `contracts/README.md` en esta misma carpeta.
