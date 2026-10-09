/** Where the API lives when no consumer said otherwise — the local dev server. */
const DEFAULT_BASE_URL = "http://localhost:3001";

let baseUrl = DEFAULT_BASE_URL;

/**
 * Points the client at the API (scheme + host + port, no `/api/v1`). Each consumer calls it once
 * at startup with its own build-time setting: the app with `VITE_API_URL`, the public site with
 * `PUBLIC_API_URL`. The client itself never reads environment variables.
 */
export function configureClient({ baseUrl: url }: { baseUrl: string | undefined }): void {
  baseUrl = url && url.trim() !== "" ? url.trim().replace(/\/+$/, "") : DEFAULT_BASE_URL;
}

export function getBaseUrl(): string {
  return baseUrl;
}
