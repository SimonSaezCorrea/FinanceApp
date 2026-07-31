import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from "@nestjs/common";
import type { Observable } from "rxjs";
import { tap } from "rxjs/operators";

/**
 * Decorator (FR-013): wraps every command/query dispatch with logging + timing
 * without a single handler knowing about it. Registered once as a global
 * `APP_INTERCEPTOR` (see `app.module.ts`), so it covers all 12 domains'
 * controllers — each of which is a thin Facade whose only job is to dispatch
 * one command or query, making the request span and the handler span the same
 * thing in practice.
 *
 * Deliberately NOT implemented by hand-wrapping `CommandBus.execute` or by
 * putting a `Logger` call inside `BaseCommandHandler.execute` — FR-013 requires
 * using NestJS's own decoration mechanism so handler code stays free of
 * concerns unrelated to its business operation.
 */
@Injectable()
export class HandlerLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger("Cqrs");

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();

    const startedAt = process.hrtime.bigint();
    const label = `${context.getClass().name}.${context.getHandler().name}`;

    const elapsedMs = () => Number(process.hrtime.bigint() - startedAt) / 1e6;

    return next.handle().pipe(
      tap({
        next: () => this.logger.debug(`${label} ok in ${elapsedMs().toFixed(1)}ms`),
        error: (error: unknown) => {
          const code =
            error instanceof Error && "code" in error
              ? String((error as { code: unknown }).code)
              : undefined;
          this.logger.warn(
            `${label} failed in ${elapsedMs().toFixed(1)}ms${code ? ` (${code})` : ""}`,
          );
        },
      }),
    );
  }
}
