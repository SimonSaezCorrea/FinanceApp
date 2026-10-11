import type { ApiError } from "@finance/contracts";
import { API_BASE_PATH, IDEMPOTENCY_HEADER } from "@finance/contracts/http";

/**
 * The ONLY way the frontend talks to the backend (FR-003): HTTP, credentials
 * included (httpOnly auth cookies), errors surfaced as stable codes the UI maps
 * to es/en text. The frontend never imports backend internals or touches the DB.
 *
 * Silent refresh: on 401 the client tries POST /auth/refresh once. If it
 * succeeds the original request is retried transparently. If the refresh also
 * fails (refresh token expired / missing) the error propagates normally.
 */
import { getBaseUrl } from "./config";

export class ApiRequestError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly field?: string,
  ) {
    super(code);
    this.name = "ApiRequestError";
  }
}

/**
 * The error code to show for a failed request, so a screen can say WHAT happened:
 * - the API's own code when it answered (`INVALID_CREDENTIALS`, `LOGIN_LOCKED`…);
 * - when no answer came at all (`fetch` rejects with a TypeError), which side failed:
 *   `OFFLINE` when the device knows it has no network (`navigator.onLine === false`: Wi-Fi
 *   off, airplane mode — reliable), else `NETWORK_ERROR`: the device has a network, so the
 *   server is most likely the one not answering (it can't be proved from the browser);
 * - `INTERNAL_ERROR` for anything else.
 */
export function failureCode(error: unknown): string {
  if (error instanceof ApiRequestError) return error.code;
  if (error instanceof TypeError) {
    return typeof navigator !== "undefined" && navigator.onLine === false
      ? "OFFLINE"
      : "NETWORK_ERROR";
  }
  return "INTERNAL_ERROR";
}

function buildUrl(path: string): string {
  return `${getBaseUrl()}${API_BASE_PATH}${path}`;
}

async function rawFetch(path: string, init: RequestInit): Promise<Response> {
  // A multipart upload must NOT carry a hand-written Content-Type: only the
  // browser knows the boundary it generated for the FormData body.
  const isMultipart = typeof FormData !== "undefined" && init.body instanceof FormData;
  return fetch(buildUrl(path), {
    ...init,
    credentials: "include",
    headers: isMultipart
      ? { ...init.headers }
      : { "Content-Type": "application/json", ...init.headers },
  });
}

async function parseResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let code = "INTERNAL_ERROR";
    let field: string | undefined;
    try {
      const body = (await res.json()) as ApiError;
      code = body.error?.code ?? code;
      field = body.error?.field;
    } catch {
      // non-JSON error body — keep defaults
    }
    throw new ApiRequestError(code, res.status, field);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * The refresh currently in flight, shared by every caller that hits a 401 while
 * it runs. Without this, N concurrent requests firing on the same expired session
 * each POST their own /auth/refresh — a view with five queries produced five
 * rotations, and with react-query's retries on top the server logged dozens of
 * NO_REFRESH_TOKEN in a couple of seconds.
 */
let refreshInFlight: Promise<boolean> | null = null;

/**
 * Set once a refresh has failed: there is no valid refresh cookie, so every
 * later 401 is the SAME dead session and re-asking can only fail again. Cleared
 * by `resetAuthRefresh()` when a real login re-establishes one.
 */
let refreshExhausted = false;

/** Call after a successful login/register: a new session deserves a new attempt. */
export function resetAuthRefresh(): void {
  refreshExhausted = false;
  refreshInFlight = null;
}

const REFRESH_PATH = "/auth/refresh";

/** The `{ error: { code } }` of an error response, read from a clone so the original body stays
 * available to `parseResponse`. Null when the body isn't that shape. */
async function errorCodeOf(res: Response): Promise<string | null> {
  try {
    const body = (await res.clone().json()) as { error?: { code?: unknown } };
    return typeof body.error?.code === "string" ? body.error.code : null;
  } catch {
    return null;
  }
}

function refreshSession(): Promise<boolean> {
  refreshInFlight ??= rawFetch(REFRESH_PATH, { method: "POST" })
    .then((res) => {
      if (!res.ok) refreshExhausted = true;
      return res.ok;
    })
    .catch(() => {
      // A network failure isn't proof the session is gone — don't burn the
      // circuit breaker on it, just report this attempt as failed.
      return false;
    })
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

/**
 * `RequestInit` plus the attempt's identity. The key rides in the headers of the
 * SAME `init` that the 401 refresh below replays, so that silent retry is
 * covered without any extra handling here.
 */
export type ApiRequestInit = RequestInit & { idempotencyKey?: string };

export async function apiFetch<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const { idempotencyKey, ...rest } = init;
  const request: RequestInit = idempotencyKey
    ? {
        ...rest,
        headers: { ...rest.headers, [IDEMPOTENCY_HEADER]: idempotencyKey },
      }
    : rest;

  let res = await rawFetch(path, request);

  // Silent refresh: a 401 that means "no live session" (`UNAUTHORIZED`, what the guard answers
  // when the access token expired) rotates the tokens and retries the request once — on ANY path,
  // `/auth/me` included: excluding every `/auth/*` path made an expired access token look signed
  // out on startup while the refresh token was still good. A 401 with its own code is a wrong
  // credential (INVALID_CURRENT_PASSWORD, INVALID_CREDENTIALS, INVALID_MFA_CODE…) and is never
  // retried, or each failed attempt would count twice against its lockout. Concurrent callers
  // share the single in-flight refresh instead of each starting one.
  if (
    res.status === 401 &&
    path !== REFRESH_PATH &&
    !refreshExhausted &&
    (await errorCodeOf(res)) === "UNAUTHORIZED"
  ) {
    const refreshed = await refreshSession();
    if (refreshed) {
      res = await rawFetch(path, request);
    }
  }

  return parseResponse<T>(res);
}
