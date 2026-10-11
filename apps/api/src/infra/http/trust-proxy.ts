import type { ConfigService } from "@nestjs/config";
import type { NestExpressApplication } from "@nestjs/platform-express";

/**
 * How many proxies sit in front of the API, from `TRUST_PROXY_HOPS` (a non-negative integer, 0 when
 * unset). Behind them `req.ip` is the last proxy's address unless Express is told to trust that many
 * `X-Forwarded-For` hops — and a session's location and device list read `req.ip`. A count, never
 * `true`: trusting every hop would let a client pick its own IP by sending the header itself. A
 * malformed value fails at boot.
 *
 * Production (deploy/) is 1: Caddy is the only proxy in front of the API and it REPLACES
 * X-Forwarded-For with Cloudflare's CF-Connecting-IP. That header is trustworthy only because
 * nothing but Cloudflare can reach Caddy — the security group admits Cloudflare's ranges alone and
 * Caddy demands Cloudflare's client certificate (Authenticated Origin Pulls). If that ever stops
 * being true, `req.ip` must not drive a security decision (rate limiting, allow/deny lists).
 */
export function trustProxyHops(config: ConfigService): number {
  const raw = config.get<string>("TRUST_PROXY_HOPS")?.trim();
  if (!raw) return 0;
  if (!/^\d+$/.test(raw)) {
    throw new Error(`TRUST_PROXY_HOPS must be a non-negative integer, got "${raw}"`);
  }
  return Number(raw);
}

export function useTrustProxy(app: NestExpressApplication, config: ConfigService): void {
  const hops = trustProxyHops(config);
  if (hops > 0) app.set("trust proxy", hops);
}
