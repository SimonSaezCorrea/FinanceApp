import { UAParser } from "ua-parser-js";

/**
 * Derives a short, human-readable device label from a request's raw User-Agent header —
 * called exactly once, at session creation (research.md R4). A `Session` row stores the
 * RESULT, never the raw header, so this never runs again on a later read.
 */
export function parseDeviceLabel(userAgent: string | undefined): string | null {
  if (!userAgent || userAgent.trim().length === 0) return null;
  const { browser, os } = new UAParser(userAgent).getResult();
  const parts = [browser.name, os.name].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : null;
}
