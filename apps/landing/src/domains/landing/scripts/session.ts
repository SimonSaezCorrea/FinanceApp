import type { auth } from "@finance/contracts";
import { API_BASE_PATH } from "@finance/contracts/http";

import { isAppReachable } from "../../../lib/appReachable";
import { API_URL } from "../../../lib/config";

/**
 * "Ir a la app" for someone already signed in (spec 031, US5): after the page has painted, ask the
 * API whether this browser holds a live session (`GET /auth/session`, always a 200 — a signed-out
 * visitor is the normal case here and must not leave a 401 in the console) and, only on a clear
 * yes, swap each `[data-access-slot]` for its `<template data-app-template>`. Anything else (signed
 * out, API down, slower than two seconds) leaves the sign-in actions as they are: the page never
 * waits on this and never shows an error for it.
 */
export const SESSION_TIMEOUT_MS = 2000;

export async function hasSession(signal: AbortSignal = AbortSignal.timeout(SESSION_TIMEOUT_MS)) {
  try {
    const res = await fetch(`${API_URL}${API_BASE_PATH}/auth/session`, {
      credentials: "include",
      signal,
    });
    if (!res.ok) return false;
    const body = (await res.json()) as Partial<auth.SessionStatus>;
    return body.signedIn === true;
  } catch {
    return false;
  }
}

export function showGoToApp(root: ParentNode = document): void {
  for (const slot of root.querySelectorAll<HTMLElement>("[data-access-slot]")) {
    const template = slot.querySelector<HTMLTemplateElement>("template[data-app-template]");
    if (!template) continue;
    slot.replaceChildren(template.content.cloneNode(true));
  }
}

export async function initSession(check: () => Promise<boolean> = hasSession): Promise<void> {
  if (await check()) showGoToApp();
}

/**
 * "Ir a la app" asks the app first (same probe as after signing in): when it doesn't answer, the
 * page says so — a notice right under the header, by the button, that stays until closed or
 * retried — instead of letting the browser show its own error page. While asking, the link reads
 * "Comprobando…". A modified click (new tab, …) is left to the browser.
 */
export function initGoToApp(
  probe: () => Promise<boolean> = () => isAppReachable(),
  navigate: (url: string) => void = (url) => location.assign(url),
  root: Document = document,
): void {
  const notice = () => root.querySelector<HTMLElement>("[data-app-down]");
  let lastHref: string | null = null;

  async function go(href: string, link: HTMLAnchorElement | null) {
    lastHref = href;
    const label = link?.textContent ?? null;
    if (link) {
      link.setAttribute("aria-busy", "true");
      link.textContent = link.dataset.checkingLabel ?? label;
    }
    const retry = root.querySelector<HTMLButtonElement>("[data-app-down-retry]");
    if (retry) retry.disabled = true;
    const reachable = await probe();
    if (link) {
      link.removeAttribute("aria-busy");
      link.textContent = label;
    }
    if (retry) retry.disabled = false;
    const box = notice();
    if (reachable) {
      if (box) box.hidden = true;
      navigate(href);
    } else if (box) {
      box.hidden = false;
    }
  }

  root.addEventListener("click", (event) => {
    const target = event.target as Element | null;
    if (target?.closest("[data-app-down-close]")) {
      const box = notice();
      if (box) box.hidden = true;
      return;
    }
    if (target?.closest("[data-app-down-retry]")) {
      if (lastHref) void go(lastHref, null);
      return;
    }
    const link = target?.closest<HTMLAnchorElement>("a[data-go-app]");
    if (!link || event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void go(link.href, link);
  });
}
