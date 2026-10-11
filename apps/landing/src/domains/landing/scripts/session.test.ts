import { beforeEach, describe, expect, it, vi } from "vitest";

import { APP_URL } from "../../../lib/config";
import { isAppReachable } from "../../../lib/appReachable";
import { hasSession, initGoToApp, initSession } from "./session";

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

describe("isAppReachable", () => {
  it("is true when the app answers at all, false when nothing does", async () => {
    const answer = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    expect(await isAppReachable(answer as unknown as typeof fetch)).toBe(true);
    expect(answer).toHaveBeenCalledWith(
      `${APP_URL}/robots.txt`,
      expect.objectContaining({ mode: "no-cors", cache: "no-store" }),
    );

    const refused = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await isAppReachable(refused as unknown as typeof fetch)).toBe(false);
  });
});

describe("initGoToApp", () => {
  function setup(reachable: boolean) {
    document.body.innerHTML = `
      <a href="${APP_URL}/" data-go-app>Ir a la app</a>
      <div data-app-down hidden>
        <button data-app-down-retry>Reintentar</button>
        <button data-app-down-close>Cerrar</button>
      </div>`;
    const navigate = vi.fn();
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = document.body.innerHTML;
    const probe = vi.fn(() => Promise.resolve(reachable));
    initGoToApp(probe, navigate, doc);
    const link = doc.querySelector("a")!;
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    return { navigate, probe, doc, notice: doc.querySelector<HTMLElement>("[data-app-down]")! };
  }

  it("goes to the app when it answers", async () => {
    const { navigate, notice } = setup(true);
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(`${APP_URL}/`));
    expect(notice.hidden).toBe(true);
  });

  it("stays and says so when the app doesn't answer", async () => {
    const { navigate, notice } = setup(false);
    await vi.waitFor(() => expect(notice.hidden).toBe(false));
    expect(navigate).not.toHaveBeenCalled();
  });

  it("keeps the notice until closed, and 'Reintentar' asks again", async () => {
    const { probe, doc, notice } = setup(false);
    await vi.waitFor(() => expect(notice.hidden).toBe(false));
    doc.querySelector<HTMLButtonElement>("[data-app-down-retry]")!.click();
    await vi.waitFor(() => expect(probe).toHaveBeenCalledTimes(2));
    expect(notice.hidden).toBe(false);
    doc.querySelector<HTMLButtonElement>("[data-app-down-close]")!.click();
    expect(notice.hidden).toBe(true);
  });
});
