# Phase 1 Data Model: Renombrar passkeys y autocompletado condicional

## Sin columnas nuevas

`Passkey.name` ya existe (specs/022) — esta feature no toca `schema.prisma`.

## Puerto extendido: `PasskeyRepositoryPort`

```ts
/**
 * Cambia el nombre de una llave, ownership-scoped en una sola sentencia (specs/025) — devuelve
 * `null` si la fila no existe o no pertenece a `userId`, igual que `findByIdOwned`.
 */
renameOwned(userId: string, id: string, name: string): Promise<PasskeyProps | null>;
```

Implementación en `PrismaPasskeyRepository`:

```ts
async renameOwned(userId: string, id: string, name: string): Promise<PasskeyProps | null> {
  const result = await this.prisma.passkey.updateMany({
    where: { id, userId },
    data: { name },
  });
  if (result.count === 0) return null;
  const row = await this.prisma.passkey.findUniqueOrThrow({ where: { id } });
  return rowToProps(row);
}
```

## Comando nuevo: `RenamePasskeyCommand`

```ts
export class RenamePasskeyCommand implements UserScopedCommand {
  readonly scope = "user" as const;
  constructor(
    public readonly userId: string,
    public readonly passkeyId: string,
    public readonly name: string,
  ) {}
}
```

## Handler nuevo: `RenamePasskeyHandler`

```ts
@Injectable()
@CommandHandler(RenamePasskeyCommand)
export class RenamePasskeyHandler extends BaseCommandHandler<
  RenamePasskeyCommand,
  auth.Passkey,
  null
> {
  constructor(
    eventBus: EventBus,
    @Inject(PASSKEY_REPOSITORY) private readonly passkeys: PasskeyRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handle(command: RenamePasskeyCommand): Promise<HandleResult<auth.Passkey>> {
    const renamed = await this.passkeys.renameOwned(
      command.userId,
      command.passkeyId,
      command.name,
    );
    if (!renamed) throw new PasskeyNotFoundError();
    return {
      result: {
        id: renamed.id,
        name: renamed.name,
        createdAt: renamed.createdAt,
        lastUsedAt: renamed.lastUsedAt,
      },
      events: [],
    };
  }
}
```

## Contrato nuevo: `renamePasskeyRequestSchema`

```ts
export const renamePasskeyRequestSchema = z.object({
  name: z.string().trim().min(1).max(60),
});
export type RenamePasskeyRequest = z.infer<typeof renamePasskeyRequestSchema>;
```

Response: reutiliza `passkeySchema` ya existente (misma forma que `confirmPasskeyRegistrationRequestSchema`
devuelve).

## Sin cambios en el modelo de sesión/login

El mecanismo de autocompletado condicional no introduce ninguna forma de datos nueva — reutiliza
`StartPasskeyLoginRequest`/`StartPasskeyLoginResponse`/`VerifyPasskeyLoginRequest` tal como están.
