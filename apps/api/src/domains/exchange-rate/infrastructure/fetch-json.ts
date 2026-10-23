import { ExchangeRateSourceUnavailableError } from "../application/exchange-rate-source";

export interface FetchJsonOptions {
  /** Tries in total, the first one included. */
  attempts?: number;
  /** Per attempt. */
  timeoutMs?: number;
  /** Pause before each retry. */
  retryDelayMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * GET + JSON for the exchange-rate sources (native `fetch`). A timeout, a network error or a 5xx
 * is retried: on 2026-10-22 every tick of the day hit mindicador.cl when it was slow and a single
 * 10 s attempt lost the whole day. A 4xx or unreadable JSON is not (asking again cannot fix it).
 * Any final failure is `ExchangeRateSourceUnavailableError`; the URL is never logged (it may
 * carry a token).
 */
export async function fetchJson(url: string, options: FetchJsonOptions = {}): Promise<unknown> {
  const { attempts = 2, timeoutMs = 15_000, retryDelayMs = 1_000, fetchImpl = fetch } = options;
  let lastError = "no attempt";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (attempt > 1 && retryDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
    let res: Response;
    try {
      res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      lastError = `request failed: ${String(err)}`;
      continue;
    }
    if (res.status >= 500) {
      lastError = `status ${res.status}`;
      continue;
    }
    if (!res.ok) throw new ExchangeRateSourceUnavailableError(`status ${res.status}`);
    try {
      return await res.json();
    } catch {
      throw new ExchangeRateSourceUnavailableError("invalid JSON");
    }
  }
  throw new ExchangeRateSourceUnavailableError(`${lastError} (after ${attempts} attempts)`);
}
