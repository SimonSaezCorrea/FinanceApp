import { CallHandler, ExecutionContext, Logger, NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";
import { delay } from "rxjs/operators";

/**
 * Dev-only latency simulator: holds every response back by `API_DELAY_MS`
 * (plus up to `API_DELAY_JITTER_MS` of random extra) so the local UI shows the
 * loading/skeleton states a real network produces. Without it every request
 * resolves in ~2ms against localhost and a whole class of bugs (a layout that
 * measures itself before its data lands, a flash of empty state, a spinner that
 * never renders) is invisible until production.
 *
 * It is NEVER registered when `NODE_ENV === "production"` — `registerArtificialDelay`
 * below is the only wiring, and it refuses to install itself there.
 */
export class ArtificialDelayInterceptor implements NestInterceptor {
  constructor(
    private readonly baseMs: number,
    private readonly jitterMs: number,
  ) {}

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const wait = this.baseMs + (this.jitterMs > 0 ? Math.random() * this.jitterMs : 0);
    return next.handle().pipe(delay(Math.round(wait)));
  }
}

/** Reads the env vars and installs the interceptor, or does nothing. */
export function registerArtificialDelay(
  app: { useGlobalInterceptors: (i: NestInterceptor) => void },
  env: { get: <T = string>(key: string) => T | undefined },
): void {
  if (env.get("NODE_ENV") === "production") return;

  const baseMs = Number(env.get("API_DELAY_MS") ?? 0);
  const jitterMs = Number(env.get("API_DELAY_JITTER_MS") ?? 0);
  if (!Number.isFinite(baseMs) || baseMs <= 0) return;

  app.useGlobalInterceptors(
    new ArtificialDelayInterceptor(baseMs, Number.isFinite(jitterMs) ? jitterMs : 0),
  );
  Logger.warn(
    `Artificial latency ON: every response delayed ${baseMs}ms` +
      (jitterMs > 0 ? ` + up to ${jitterMs}ms jitter` : "") +
      " (API_DELAY_MS — dev only)",
    "Bootstrap",
  );
}
