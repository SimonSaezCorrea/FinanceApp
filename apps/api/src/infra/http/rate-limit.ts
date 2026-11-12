import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  Logger,
  SetMetadata,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import type { Request, Response } from "express";

/**
 * Request limits per client (security run-3). Each policy is a fixed window: at most `limit`
 * requests per `windowSeconds`, counted per key — the client's IP for public routes, the signed-in
 * user for expensive authenticated ones. Routes sharing a policy share its count.
 *
 * Why: the per-ACCOUNT lockouts (5 wrong passwords or codes → 15 min) stop guessing one account,
 * but nothing stopped one client from trying many accounts, or from sending bcrypt-heavy requests
 * (~0.1–0.7 s of CPU each) until the server starved; and a signed-in user could repeat 5 MB
 * imports or "Reemplazar todo" back to back.
 *
 * Counts live in this process's memory: nothing to deploy, and the API runs as one container
 * (two for about a minute during a deploy, when a client may get up to twice the limit). The IP is
 * `req.ip`, trustworthy only because of `TRUST_PROXY_HOPS` (see `trust-proxy.ts`). An IPv6 client
 * is counted by its /64, which one subscriber usually holds whole.
 */
export const RATE_LIMIT_POLICIES = {
  /** Checks a password, a second-factor code, a passkey or a one-time link. */
  authAttempt: { limit: 30, windowSeconds: 10 * 60, key: "ip" },
  /** Sends an email (sign-up, recovery, a code) or starts a ceremony. */
  authEmail: { limit: 10, windowSeconds: 60 * 60, key: "ip" },
  /** Imports and attachment uploads: big bodies, long transactions. */
  heavyWrite: { limit: 20, windowSeconds: 10 * 60, key: "user" },
} as const satisfies Record<string, { limit: number; windowSeconds: number; key: "ip" | "user" }>;

export type RateLimitPolicy = keyof typeof RATE_LIMIT_POLICIES;

const RATE_LIMIT_KEY = "fik:rate-limit";

/** Marks a route with a policy. A per-user policy must come AFTER `JwtAuthGuard` in `@UseGuards`. */
export const RateLimit = (policy: RateLimitPolicy) => SetMetadata(RATE_LIMIT_KEY, policy);

/** Same rule as the crons: ON in production, OFF anywhere else (tests and local runs all come
 * from one loopback address); `RATE_LIMITS_ENABLED=true|false` overrides it. */
export function rateLimitsEnabled(config: Pick<ConfigService, "get">): boolean {
  const raw = config.get<string>("RATE_LIMITS_ENABLED")?.trim().toLowerCase();
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw) throw new Error(`RATE_LIMITS_ENABLED must be "true" or "false" (got "${raw}")`);
  return config.get<string>("NODE_ENV") === "production";
}

/** The IPv4 address, or the /64 of an IPv6 one. */
export function clientKey(ip: string | undefined): string {
  if (!ip) return "unknown";
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return mapped[1];
  if (!ip.includes(":")) return ip;
  return `${ipv6Groups(ip, 4)}::/64`;
}

/** The /48 of an IPv6 address (null for IPv4): a coarser count, so hopping between the 65,536
 * /64s of one allocation doesn't buy a fresh limit each time. */
export function wideClientKey(ip: string | undefined): string | null {
  const key = clientKey(ip);
  if (!key.endsWith("::/64")) return null;
  return `${ipv6Groups(ip as string, 3)}::/48`;
}

function ipv6Groups(ip: string, count: number): string {
  const [head, tail = ""] = ip.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = ip.includes("::")
    ? [...left, ...new Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right]
    : left;
  return groups
    .slice(0, count)
    .map((g) => (g || "0").toLowerCase().replace(/^0+(?=.)/, ""))
    .join(":");
}

/** Thrown with the shape `AllExceptionsFilter` reads from a domain error, so `details` reaches
 * the client (the web says when to retry). */
export class RateLimitedError extends Error {
  readonly httpStatus = 429;
  readonly code = "RATE_LIMITED";
  readonly field = undefined;
  constructor(readonly details: { retryAfterSeconds: number }) {
    super("RATE_LIMITED");
  }
}

interface Window {
  count: number;
  limit: number;
  resetAt: number;
}

/** Fixed-window counters. Expired windows are dropped as they are met and on a periodic sweep. */
export class RateLimitStore {
  private readonly windows = new Map<string, Window>();
  private lastSweep = 0;

  constructor(private readonly maxEntries = 100_000) {}

  /** Counts one request; returns the seconds to wait when it went over the limit. */
  hit(key: string, limit: number, windowSeconds: number, now: number): number | null {
    this.sweep(now);
    let window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      window = { count: 0, limit, resetAt: now + windowSeconds * 1000 };
      this.windows.set(key, window);
    }
    window.count += 1;
    if (window.count <= limit) return null;
    return Math.max(1, Math.ceil((window.resetAt - now) / 1000));
  }

  get size(): number {
    return this.windows.size;
  }

  private sweep(now: number): void {
    if (now - this.lastSweep < 60_000 && this.windows.size < this.maxEntries) return;
    this.lastSweep = now;
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key);
    }
    // Still full of live windows (a flood of distinct keys): make room rather than grow, but
    // never by forgetting a client that is being held back — dropping the oldest windows first
    // would let a flood of new keys erase the very count that blocks the flooder. Windows still
    // under their limit go first; one over it only if nothing else is left.
    const target = Math.floor(this.maxEntries * 0.9);
    if (this.windows.size >= this.maxEntries) {
      for (const [key, window] of this.windows) {
        if (this.windows.size <= target) return;
        if (window.count <= window.limit) this.windows.delete(key);
      }
      for (const key of this.windows.keys()) {
        if (this.windows.size <= target) return;
        this.windows.delete(key);
      }
    }
  }
}

/** One store for the process: Nest builds a guard instance per module, and a policy shared by
 * routes of several modules (imports, attachments) must count them together. */
const SHARED_STORE = new RateLimitStore();

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  private readonly enabled: boolean;

  constructor(
    private readonly reflector: Reflector,
    config: ConfigService,
  ) {
    this.enabled = rateLimitsEnabled(config);
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.enabled) return true;
    const policyName = this.reflector.getAllAndOverride<RateLimitPolicy | undefined>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!policyName) return true;
    const policy = RATE_LIMIT_POLICIES[policyName];
    const req = context.switchToHttp().getRequest<Request & { user?: { id: string } }>();
    const who = policy.key === "user" ? req.user?.id : clientKey(req.ip);
    if (!who) return true; // a per-user policy on a route without a user: nothing to count
    const now = Date.now();
    let retryAfter = SHARED_STORE.hit(
      `${policyName}|${who}`,
      policy.limit,
      policy.windowSeconds,
      now,
    );
    // An IPv6 client also counts against its /48, with room for 10 clients' worth. Only requests
    // its /64 let through count there: one /64 can add at most `limit` per window, so filling the
    // /48 takes many /64s (the hopping this exists to catch) and one noisy client can't lock out
    // its neighbours by hammering after it was blocked.
    const wide = retryAfter === null && policy.key === "ip" ? wideClientKey(req.ip) : null;
    if (wide) {
      retryAfter = SHARED_STORE.hit(
        `${policyName}|${wide}`,
        policy.limit * 10,
        policy.windowSeconds,
        now,
      );
    }
    if (retryAfter === null) return true;
    this.logger.warn(`rate limit ${policyName} reached by ${policy.key}`);
    context.switchToHttp().getResponse<Response>().setHeader("Retry-After", String(retryAfter));
    throw new RateLimitedError({ retryAfterSeconds: retryAfter });
  }
}
