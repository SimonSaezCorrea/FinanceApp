import { useCallback, useRef } from "react";

/**
 * One key per form ATTEMPT — not per request, and not per form opening.
 *
 * This is the single most error-prone part of the feature, so the two wrong
 * shapes are worth naming:
 *
 *  - a key per REQUEST protects nothing: every retry would look like a new
 *    attempt, which is exactly the state we are fixing.
 *  - a key per form OPENING breaks "Guardar y crear otro": the second record
 *    would reuse the first one's key and be rejected as a duplicate.
 *
 * So: minted lazily on the first submit, kept while the user keeps retrying THAT
 * submission, and dropped once it succeeds so the next one starts fresh.
 *
 * Known limit, deliberate: this lives in memory. Reloading the page mid-submit
 * loses it, and a resubmit is then a genuinely new attempt that can duplicate.
 * Avoiding that needs draft persistence, which is a separate concern (see the
 * spec's Out of Scope).
 */
export function useIdempotencyKey(): {
  /** The current attempt's key, minted on first call and stable across retries. */
  current: () => string;
  /** Call after a successful submit so the next one gets a new identity. */
  reset: () => void;
} {
  const keyRef = useRef<string | null>(null);

  const current = useCallback(() => {
    keyRef.current ??= newKey();
    return keyRef.current;
  }, []);

  const reset = useCallback(() => {
    keyRef.current = null;
  }, []);

  return { current, reset };
}

/** `crypto.randomUUID` needs a secure context; localhost counts. The fallback
 * keeps a non-secure origin (an IP on a LAN, say) from crashing the form —
 * it only has to be unguessable enough not to collide with this user's own keys. */
function newKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}
