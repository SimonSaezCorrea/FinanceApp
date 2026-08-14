import { API_BASE_PATH, type ApiError } from "@finance/contracts";

/**
 * The ONLY way the frontend talks to the backend (FR-003): HTTP, credentials
 * included (httpOnly auth cookies), errors surfaced as stable codes the UI maps
 * to es/en text. The frontend never imports backend internals or touches the DB.
 *
 * Silent refresh: on 401 the client tries POST /auth/refresh once. If it
 * succeeds the original request is retried transparently. If the refresh also
 * fails (refresh token expired / missing) the error propagates normally.
 */
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

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

function buildUrl(path: string): string {
  return `${API_URL}${API_BASE_PATH}${path}`;
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

function refreshSession(): Promise<boolean> {
  refreshInFlight ??= rawFetch("/auth/refresh", { method: "POST" })
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

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res = await rawFetch(path, init);

  // Silent refresh: intercept 401 on non-auth paths, attempt token rotation,
  // then retry the original request once. Concurrent callers share the single
  // in-flight refresh instead of each starting one.
  if (res.status === 401 && !path.startsWith("/auth/") && !refreshExhausted) {
    const refreshed = await refreshSession();
    if (refreshed) {
      res = await rawFetch(path, init);
    }
  }

  return parseResponse<T>(res);
}
