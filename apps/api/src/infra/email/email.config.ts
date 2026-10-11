import type { ConfigService } from "@nestjs/config";

export type EmailDelivery = "resend" | "disabled";

export interface EmailConfig {
  delivery: EmailDelivery;
  from: string;
  replyTo: string;
  /** The public site the links open (verify an address, choose a new password); no trailing "/". */
  publicSiteUrl: string;
  /** Only meaningful when `delivery === "resend"`. */
  resendApiKey: string | null;
}

const DEFAULT_FROM = "fik <no-reply@mifik.cl>";
const DEFAULT_REPLY_TO = "contacto@mifik.cl";
const DEFAULT_SITE = "http://localhost:4321";

/** Drops trailing "/" with a loop: a trailing-slashes regex is quadratic on a long run of them. */
function withoutTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") end--;
  return value.slice(0, end);
}

function read(config: ConfigService, key: string): string | null {
  const value = config.get<string>(key)?.trim();
  return value ? value : null;
}

/**
 * Picks how emails leave (research.md R3). Real delivery needs BOTH `NODE_ENV=production` and a
 * `RESEND_API_KEY`: a key pasted into a local `.env` by mistake must never email real people from
 * a developer's machine (FR-004). Anything else is "disabled": nothing is sent, and the endpoints
 * that need an email answer `EMAIL_UNAVAILABLE` (FR-005).
 */
export function readEmailConfig(config: ConfigService): EmailConfig {
  const production = config.get<string>("NODE_ENV") === "production";
  const resendApiKey = read(config, "RESEND_API_KEY");
  const delivery: EmailDelivery = production && resendApiKey ? "resend" : "disabled";
  return {
    delivery,
    from: read(config, "EMAIL_FROM") ?? DEFAULT_FROM,
    replyTo: read(config, "EMAIL_REPLY_TO") ?? DEFAULT_REPLY_TO,
    publicSiteUrl: withoutTrailingSlashes(read(config, "PUBLIC_SITE_URL") ?? DEFAULT_SITE),
    resendApiKey: delivery === "resend" ? resendApiKey : null,
  };
}
