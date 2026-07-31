import type {
  UserScopedCommand as UserScopedQuery,
  SystemCommand as SystemQuery,
} from "./base-command.handler";

export type BaseQuery = UserScopedQuery | SystemQuery;

/**
 * Template Method, read-only variant (FR-007): load -> handle, no persist/event
 * steps at all — reads never mutate state and never publish events (FR-003).
 */
export abstract class BaseQueryHandler<TQuery extends BaseQuery, TResult, TContext = unknown> {
  async execute(query: TQuery): Promise<TResult> {
    const context = await this.loadContext(query);
    return this.handle(query, context);
  }

  protected abstract loadContext(query: TQuery): Promise<TContext>;

  protected abstract handle(query: TQuery, context: TContext): Promise<TResult>;
}
