import { API_BASE_PATH } from "@finance/contracts/http";

import { API_URL } from "../../../lib/config";

/**
 * Shared by the two pages an email link opens (specs/032): read the link's token, call the public
 * endpoint, and show one of the page's prepared states (`[data-state]`). The text of every state
 * is rendered at build time in the page's language — this only picks which one is visible.
 */
export type LinkPageState = "loading" | "form" | "success" | "invalid" | "error";

/** The `token` of the address, or null when the link was cut or edited. */
export function tokenFromLocation(search: string = location.search): string | null {
  const token = new URLSearchParams(search).get("token")?.trim();
  return token ? token : null;
}

/**
 * Drops the token from the address bar once it has been read, so it stays out of the history, a
 * bookmark or a copied link (specs/032). Only the address changes; the page doesn't reload.
 */
export function forgetTokenInAddress(): void {
  const url = new URL(location.href);
  if (!url.searchParams.has("token")) return;
  url.searchParams.delete("token");
  history.replaceState(history.state, "", url);
}

/** Shows exactly one `[data-state]` block of `root`. */
export function showState(root: ParentNode, state: LinkPageState): void {
  for (const el of root.querySelectorAll<HTMLElement>("[data-state]")) {
    el.hidden = el.dataset.state !== state;
  }
}

export type PostOutcome = "ok" | "invalid" | "error";

/** POSTs to a public auth endpoint. `EMAIL_TOKEN_INVALID` is the link's own fault; anything
 * else (the API down, a 5xx) is "try again later". */
export async function postLink(path: string, body: unknown): Promise<PostOutcome> {
  try {
    const res = await fetch(`${API_URL}${API_BASE_PATH}${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return "ok";
    if (res.status === 400) {
      const payload = (await res.json().catch(() => null)) as {
        error?: { code?: string };
      } | null;
      return payload?.error?.code === "EMAIL_TOKEN_INVALID" ? "invalid" : "error";
    }
    return "error";
  } catch {
    return "error";
  }
}
