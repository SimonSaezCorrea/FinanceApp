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
  return fetch(buildUrl(path), {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init.headers },
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

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res = await rawFetch(path, init);

  // Silent refresh: intercept 401 on non-auth paths, attempt token rotation,
  // then retry the original request once.
  if (res.status === 401 && !path.startsWith("/auth/")) {
    const refreshRes = await rawFetch("/auth/refresh", { method: "POST" });
    if (refreshRes.ok) {
      res = await rawFetch(path, init);
    }
  }

  return parseResponse<T>(res);
}
