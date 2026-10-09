import { beforeEach, describe, expect, it, vi } from "vitest";

import { APP_URL } from "../../../lib/config";
import { hasSession, initSession } from "./session";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function page() {
  document.body.innerHTML = `
    <div data-access-slot>
      <a href="?acceso=login" data-access="login">Iniciar sesión</a>
      <template data-app-template><a href="${APP_URL}/">Ir a la app</a></template>
    </div>`;
}

describe("session script", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    page();
    return () => vi.unstubAllGlobals();
  });

  it("asks once, with the cookies, and a signed-in visitor gets 'Ir a la app'", async () => {
    fetchMock.mockResolvedValue(json({ signedIn: true }));
    await initSession();

    const link = document.querySelector("[data-access-slot] a")!;
    expect(link.textContent).toBe("Ir a la app");
    expect(link.getAttribute("href")).toBe(`${APP_URL}/`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toMatch(/\/api\/v1\/auth\/session$/);
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ credentials: "include" });
  });

  it("keeps the sign-in actions when signed out", async () => {
    fetchMock.mockResolvedValue(json({ signedIn: false }));
    await initSession();
    expect(document.querySelector("[data-access]")).not.toBeNull();
  });

  it("keeps them when the API answers an error or is down", async () => {
    fetchMock.mockResolvedValueOnce(json({}, 500));
    expect(await hasSession()).toBe(false);
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await hasSession()).toBe(false);
  });

  it("gives up after the timeout instead of waiting on a slow API", async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_, reject) =>
          init.signal!.addEventListener("abort", () => reject(new DOMException("", "AbortError"))),
        ),
    );
    const controller = new AbortController();
    const pending = hasSession(controller.signal);
    controller.abort();
    expect(await pending).toBe(false);
  });
});
