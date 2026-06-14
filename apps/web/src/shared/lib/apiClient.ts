import { API_BASE_PATH, type ApiError } from "@finance/contracts";

/**
 * The ONLY way the frontend talks to the backend (FR-003): HTTP, credentials
 * included (httpOnly auth cookies), errors surfaced as stable codes the UI maps
 * to es/en text. The frontend never imports backend internals or touches the DB.
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

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${API_BASE_PATH}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init.headers },
  });

  if (!res.ok) {
    let code = "INTERNAL_ERROR";
    let field: string | undefined;
    try {
      const body = (await res.json()) as ApiError;
      code = body.error?.code ?? code;
      field = body.error?.field;
    } catch {
      // non-JSON error body; keep defaults
    }
    throw new ApiRequestError(code, res.status, field);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
