# Internal Layer Contracts

This feature introduces **no new public HTTP contract** — every existing endpoint and
`@finance/contracts` shape is unchanged (spec FR-015). What needs a documented contract instead is
the **internal shape every domain must implement** so the pattern replicates identically across
all 11 domains (spec FR-018/User Story 5). These are illustrative signatures, not full
implementations — exact generics/imports are decided during `/speckit-implement`.

## `BaseCommandHandler<TCommand, TResult>` (Template Method, FR-007)

```ts
// A command is EITHER scoped to a requesting user, OR system-wide (e.g. the billing cron) —
// never both, never neither. `SystemCommand` has no `userId` at all, so `loadContext` knows to
// skip per-user scoping instead of receiving an empty/fake one.
type UserScopedCommand = { scope: "user"; userId: string };
type SystemCommand = { scope: "system" };
type BaseCommand = UserScopedCommand | SystemCommand;

abstract class BaseCommandHandler<TCommand extends BaseCommand, TResult> {
  async execute(command: TCommand): Promise<TResult> {
    const context = await this.loadContext(command); // scoped to userId when command.scope === "user"
    const { result, events } = await this.handle(command, context); // domain-specific step
    await this.persist(context, result); // see "Cross-aggregate persistence" below
    events.forEach((e) => this.eventBus.publish(e));
    return result;
  }

  protected abstract loadContext(command: TCommand): Promise<unknown>;
  protected abstract handle(command: TCommand, context: unknown): Promise<{ result: TResult; events: object[] }>;
  protected abstract persist(context: unknown, result: TResult): Promise<void>;
}
```

Every concrete `*CommandHandler` in every domain extends this — the fixed skeleton (load →
handle → persist → publish) never varies; only the three abstract steps do. Per-user commands set
`scope: "user"` (the overwhelming majority); only a handful of system-wide triggers (the billing
cron's `GenerateAllDueStatementsCommand` today) set `scope: "system"` and `loadContext` skips the
userId-scoping step entirely for those — this is a named, typed exception, not a silent gap in
Principle II (per-user isolation still applies to every per-user command, and the system command
still only mutates rows already scoped to their own owning user internally via the repository).

### Cross-aggregate persistence (FR-020)

When a command's `handle()` step touches more than one aggregate as one inherently atomic business
action (e.g. paying a statement: seal `CreditStatement`, create the payment `Transaction`, adjust
`BankAccount.creditUsed`), `persist()` MUST wrap every repository `save()` call for that action in
a single `prisma.$transaction(...)` — never call multiple repositories' `save()` outside a shared
transaction when they represent one atomic action. A handler with only one aggregate to persist
uses a plain `save()` call as shown above; a handler spanning more than one MUST override `persist`
to open the transaction explicitly:

```ts
protected async persist(context: PayStatementContext, result: void): Promise<void> {
  await this.prisma.$transaction(async (tx) => {
    await this.statementRepo.saveWithTx(tx, context.statement);
    await this.transactionRepo.saveWithTx(tx, context.paymentTransaction);
    await this.accountRepo.saveWithTx(tx, context.account);
  });
}
```

Ports that may participate in a cross-aggregate transaction expose a `saveWithTx(tx, aggregate)`
variant alongside their plain `save()`, so single-aggregate handlers stay simple while
multi-aggregate ones stay atomic.

## Repository Port (Adapter pattern, FR-011)

```ts
// domain/ports/<aggregate>.repository.port.ts — owned by the domain layer, zero Prisma imports
interface <Aggregate>RepositoryPort {
  findById(userId: string, id: string): Promise<<Aggregate> | null>;
  save(aggregate: <Aggregate>): Promise<void>;
}
```

```ts
// infrastructure/prisma-<aggregate>.repository.ts — the Adapter, only place allowed to import Prisma
@Injectable()
class Prisma<Aggregate>Repository implements <Aggregate>RepositoryPort {
  constructor(private readonly prisma: PrismaService) {}
  async findById(userId: string, id: string) {
    const row = await this.prisma.<table>.findFirst({ where: { id, userId } });
    return row ? <Aggregate>.fromPersistence(row) : null;
  }
  async save(aggregate: <Aggregate>) { /* upsert the aggregate's current state */ }
}
```

## Domain Event (Observer pattern, FR-004)

```ts
// domain/events/<name>.event.ts
class <Name>Event {
  constructor(
    public readonly occurredAt: Date,
    // ...fields a listener would plausibly need, nothing more
  ) {}
}
```

```ts
// application/events/<listener-name>.listener.ts
@EventsHandler(<Name>Event)
class <ListenerName> implements IEventHandler<<Name>Event> {
  handle(event: <Name>Event) { /* react — never imports the module that published it */ }
}
```

## Controller (Facade, FR-012) + Zod param validation (FR-010)

```ts
@Controller("<resource>")
class <Domain>Controller {
  constructor(private readonly commandBus: CommandBus, private readonly queryBus: QueryBus) {}

  @Post(":id/<action>")
  async doAction(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(actionParamsSchema)) params: ActionParams,
    @Body(new ZodValidationPipe(actionBodySchema)) body: ActionBody,
  ) {
    return this.commandBus.execute(new ActionCommand({ userId: user.id, ...params, ...body }));
  }
}
```

The controller never constructs an aggregate, never calls a repository, never contains an `if`
enforcing a business rule — only request → command/query → dispatch → response.

## State object (State pattern, FR-005)

```ts
// domain/states/<aggregate>-state.ts
interface <Aggregate>State {
  canClose(): boolean;
  canPay(): boolean;
  canCorrectAmount(): boolean;
}
```

Each concrete state (`OpenState`, `PendingState`, `PaidState` for `CreditStatement`) implements
this with fixed boolean logic — the aggregate delegates every "is X allowed right now" question to
`this.state`, never re-implementing the check itself.

## Strategy (FR-006)

```ts
// domain/<decision-name>.strategy.ts
interface <DecisionName>Strategy {
  applies(context: unknown): boolean; // which category this strategy handles
  evaluate(context: unknown): boolean; // the actual yes/no decision
}
```

A small resolver picks the matching strategy by `applies()` and calls `evaluate()` — adding a new
category means adding a new strategy class, never editing the existing ones.
