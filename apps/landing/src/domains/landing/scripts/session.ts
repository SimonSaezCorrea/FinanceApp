import type { auth } from "@finance/contracts";
import { API_BASE_PATH } from "@finance/contracts/http";

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
