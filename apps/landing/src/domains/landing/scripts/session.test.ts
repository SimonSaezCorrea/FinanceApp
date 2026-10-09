import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { APP_URL } from "../../../lib/config";
import { hasSession, initSession } from "./session";

const status = (code: number) => new Response(null, { status: code });

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
  });
  afterEach(() => vi.unstubAllGlobals());

  it("a signed-in visitor gets 'Ir a la app' pointing at the app", async () => {
    fetchMock.mockResolvedValue(status(200));
    await initSession();

    const link = document.querySelector("[data-access-slot] a")!;
    expect(link.textContent).toBe("Ir a la app");
    expect(link.getAttribute("href")).toBe(`${APP_URL}/`);
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ credentials: "include" });
  });

  it("renews an expired access token once before deciding", async () => {
    fetchMock
      .mockResolvedValueOnce(status(401))
      .mockResolvedValueOnce(status(200))
      .mockResolvedValueOnce(status(200));
    expect(await hasSession()).toBe(true);
    expect(String(fetchMock.mock.calls[1]![0])).toMatch(/\/auth\/refresh$/);
  });

  it("keeps the sign-in actions when signed out, even after a failed renewal", async () => {
    fetchMock.mockResolvedValueOnce(status(401)).mockResolvedValueOnce(status(401));
    await initSession();
    expect(document.querySelector("[data-access]")).not.toBeNull();
  });

  it("keeps them when the API is down", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await initSession();
    expect(document.querySelector("[data-access]")).not.toBeNull();
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
