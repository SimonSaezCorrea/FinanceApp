import { API_BASE_PATH } from "@finance/contracts/http";

import { API_URL } from "../../../lib/config";

/**
 * "Ir a la app" for someone already signed in (spec 031, US5): after the page has painted, ask the
 * API whose session this browser holds — renewing it once if the access token expired — and, only
 * on a clear yes, swap each `[data-access-slot]` for its `<template data-app-template>`. Anything
 * else (signed out, API down, slower than two seconds) leaves the sign-in actions as they are: the
 * page never waits on this and never shows an error for it.
 */
export const SESSION_TIMEOUT_MS = 2000;

const call = (path: string, init: RequestInit, signal: AbortSignal) =>
  fetch(`${API_URL}${API_BASE_PATH}${path}`, { ...init, credentials: "include", signal });

export async function hasSession(signal: AbortSignal = AbortSignal.timeout(SESSION_TIMEOUT_MS)) {
  try {
    let me = await call("/auth/me", {}, signal);
    if (me.status === 401) {
      const refreshed = await call("/auth/refresh", { method: "POST" }, signal);
      if (!refreshed.ok) return false;
      me = await call("/auth/me", {}, signal);
    }
    return me.ok;
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
