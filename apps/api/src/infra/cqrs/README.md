# `infra/cqrs` — shared Template Method + per-domain wiring convention

This module holds the two shared base classes every domain's command/query handlers extend
(`BaseCommandHandler`, `BaseQueryHandler`), plus this note on how a domain wires `@nestjs/cqrs`
into its own module. See `specs/009-ddd-cqrs-architecture/contracts/layer-contracts.md` for the
full pattern contract.

## Per-domain module wiring

Every migrated domain's `*.module.ts` follows this shape (`accounts.module.ts` is the reference):

```ts
@Module({
  imports: [CqrsModule],
  controllers: [AccountsController],
  providers: [
    // commands
    PayCreditStatementHandler,
    GenerateStatementsHandler,
    GenerateAllDueStatementsHandler,
    SyncStatementHandler,
    // queries
    ListCreditStatementsQueryHandler,
    GetAccountQueryHandler,
    // event listeners
    LogStatementPaidListener,
    // repository adapters, bound to their domain-owned ports
    { provide: BANK_ACCOUNT_REPOSITORY, useClass: PrismaBankAccountRepository },
    { provide: CREDIT_STATEMENT_REPOSITORY, useClass: PrismaCreditStatementRepository },
  ],
})
export class AccountsModule {}
```

- Every `*CommandHandler`/`*QueryHandler` is decorated with `@CommandHandler(SomeCommand)` /
  `@QueryHandler(SomeQuery)` (from `@nestjs/cqrs`) and registered as a Nest provider — that's what
  lets `CommandBus.execute`/`QueryBus.execute` find them.
- Every `*EventsHandler` (an `@EventsHandler(SomeEvent)` listener) is registered as a provider too
  — Nest's DI + `@nestjs/cqrs`'s `EventBus` wire up the subscription automatically at module init.
- Repository ports (`domain/ports/*.repository.port.ts`) are plain interfaces; bind them to their
  Prisma adapter (`infrastructure/prisma-*.repository.ts`) via an injection token so handlers depend
  only on the port, never on the concrete Prisma class (Adapter pattern, FR-011).
- The controller (presentation layer) only ever injects `CommandBus`/`QueryBus` — never a handler,
  a repository, or an aggregate directly (Facade, FR-012).

## Where new code goes

| Kind of change                                  | Lives in                                                                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| A new business rule / invariant                 | The aggregate (`domain/*.aggregate.ts`)                                                                                        |
| A new lifecycle stage for an existing aggregate | A new `domain/states/*.ts` class                                                                                               |
| A new "which category applies" decision         | A new `domain/*.strategy.ts` implementation                                                                                    |
| A new mutation                                  | A new `application/commands/*.command.ts` + `*.handler.ts` pair                                                                |
| A new read/report shape                         | A new `application/queries/*.query.ts` + `*.handler.ts` pair                                                                   |
| A new reaction to an existing event             | A new `application/events/*.listener.ts` — zero changes to the publisher                                                       |
| A new persistence operation an aggregate needs  | Add the method to its `domain/ports/*.port.ts` interface, implement it in the matching `infrastructure/prisma-*.repository.ts` |
| A new HTTP endpoint                             | A new controller method that only translates request -> command/query                                                          |
| Its test                                        | The mirrored path under `apps/api/test/{unit,integration,e2e}/domains/<domain>/<layer>/...`                                    |
