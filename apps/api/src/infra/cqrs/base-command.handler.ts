import type { EventBus } from "@nestjs/cqrs";

/**
 * A command is EITHER scoped to a requesting user, OR system-wide (e.g. the
 * billing cron) — never both, never neither. `SystemCommand` carries no
 * `userId` at all, so `loadContext` knows to skip per-user scoping instead of
 * receiving an empty/fake one (Constitution Principle II).
 */
export type UserScopedCommand = { scope: "user"; userId: string };
export type SystemCommand = { scope: "system" };
export type BaseCommand = UserScopedCommand | SystemCommand;

export type HandleResult<TResult> = { result: TResult; events: object[] };

/**
 * Template Method (FR-007): fixes the load -> handle -> persist -> publish
 * skeleton shared by every command handler in every domain. Concrete handlers
 * only supply the three domain-specific steps.
 *
 * `persist()` defaults to a no-op; override it when the handle step already
 * saved through a repository, or when a cross-aggregate transaction is needed
 * (see `contracts/layer-contracts.md`'s "Cross-aggregate persistence" — a
 * handler spanning more than one aggregate MUST wrap every save in one
 * `prisma.$transaction(...)` inside its own `persist()` override, per FR-020).
 */
export abstract class BaseCommandHandler<TCommand extends BaseCommand, TResult, TContext = unknown> {
  constructor(protected readonly eventBus: EventBus) {}

  async execute(command: TCommand): Promise<TResult> {
    const context = await this.loadContext(command);
    const { result, events } = await this.handle(command, context);
    await this.persist(context, result);
    events.forEach((e) => this.eventBus.publish(e));
    return result;
  }

  protected abstract loadContext(command: TCommand): Promise<TContext>;

  protected abstract handle(command: TCommand, context: TContext): Promise<HandleResult<TResult>>;

  // Default: no-op — override when persistence isn't already done inside handle(),
  // or when more than one aggregate must be saved atomically.
  protected async persist(_context: TContext, _result: TResult): Promise<void> {
    // no-op by default
  }
}
