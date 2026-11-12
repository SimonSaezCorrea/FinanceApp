import { config } from "zod";

/**
 * For the browsers that load these schemas (the app). Zod 4 probes once whether it may compile
 * validators with `new Function` (its JIT); under a Content-Security-Policy without
 * 'unsafe-eval' that probe is blocked and reported as a violation on every page, though Zod then
 * falls back on its own. Turning the JIT off up front skips the probe. The API keeps the JIT.
 */
export function disableSchemaJit(): void {
  config({ jitless: true });
}
