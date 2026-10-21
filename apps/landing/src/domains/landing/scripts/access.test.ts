import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AccessPanelController } from "../../auth/mountAccessPanel";
import { initAccess } from "./access";

/** The access panel ships only when opened (spec 031, R7): these check the plain-script side — what
 * loads it, what the address says, and that nothing loads for a visitor who never asks. */
function setup(search = "", signedIn = false) {
  history.replaceState(null, "", `/es/pricing/${search}`);
  document.body.innerHTML = `
    <dialog data-menu></dialog>
    <a href="?acceso=login" data-access="login">Iniciar sesión</a>
    <a href="?acceso=registro" data-access="registro">Crear cuenta</a>
    <div id="access-root" data-lang="en"></div>`;
  const controller: AccessPanelController = { open: vi.fn(), close: vi.fn() };
  const mountAccessPanel = vi.fn().mockReturnValue(controller);
  const loader = vi.fn().mockResolvedValue({ mountAccessPanel });
  const check = vi.fn().mockResolvedValue(signedIn);
  const navigate = vi.fn();
  initAccess(loader as never, check, navigate);
  return { controller, mountAccessPanel, loader, check, navigate };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("initAccess", () => {
  let listeners: [string, EventListener][] = [];
  beforeEach(() => {
    listeners = [];
    const add = document.addEventListener.bind(document);
    vi.spyOn(document, "addEventListener").mockImplementation((type, fn, opts) => {
      listeners.push([type, fn as EventListener]);
      add(type, fn, opts);
    });
  });
  afterEach(() => {
    for (const [type, fn] of listeners) document.removeEventListener(type, fn);
    vi.restoreAllMocks();
  });

  it("loads nothing until someone asks for the panel", async () => {
    const { loader } = setup();
    await flush();
    expect(loader).not.toHaveBeenCalled();
  });

  it("a click loads the panel on that view and puts it in the address", async () => {
    const { loader, mountAccessPanel } = setup();
    document.querySelector<HTMLAnchorElement>('[data-access="registro"]')!.click();
    await flush();

    expect(loader).toHaveBeenCalledTimes(1);
    expect(mountAccessPanel.mock.calls[0]![1]).toMatchObject({
      lang: "en",
      initialMode: "register",
    });
    expect(location.search).toBe("?acceso=registro");
  });

  it("a second click reuses the mounted panel", async () => {
    const { loader, controller } = setup();
    document.querySelector<HTMLAnchorElement>('[data-access="login"]')!.click();
    await flush();
    document.querySelector<HTMLAnchorElement>('[data-access="registro"]')!.click();
    await flush();

    expect(loader).toHaveBeenCalledTimes(1);
    expect(controller.open).toHaveBeenCalledWith("register");
  });

  it("closes the phone menu so it doesn't cover the panel", async () => {
    setup();
    const menu = document.querySelector<HTMLDialogElement>("dialog[data-menu]")!;
    menu.setAttribute("open", "");
    menu.close = vi.fn();
    document.querySelector<HTMLAnchorElement>('[data-access="login"]')!.click();
    expect(menu.close).toHaveBeenCalled();
  });

  it("opens on load when the address already asks, and returns to `volver`", async () => {
    const { mountAccessPanel } = setup("?acceso=login&volver=%2Faccounts");
    await flush();

    const options = mountAccessPanel.mock.calls[0]![1];
    expect(options.initialMode).toBe("login");
    expect(options.returnTo()).toBe("/accounts");
  });

  it("already signed in, an address that asks goes straight to the app at `volver`", async () => {
    const { mountAccessPanel, navigate } = setup("?acceso=login&volver=%2Faccounts", true);
    await flush();

    expect(mountAccessPanel).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(expect.stringMatching(/\/accounts$/));
  });

  it("already signed in, a foreign `volver` lands on the app's Panel", async () => {
    const { navigate } = setup("?acceso=login&volver=%2F%2Fevil.com", true);
    await flush();

    const url = navigate.mock.calls[0]![0] as string;
    expect(url).not.toContain("evil.com");
    expect(url.endsWith("/")).toBe(true);
  });

  it("asks for the session only when the address asks for the panel", async () => {
    const { check } = setup();
    await flush();
    expect(check).not.toHaveBeenCalled();
  });

  it("closing clears the panel and its return path from the address", async () => {
    const { mountAccessPanel } = setup("?acceso=login&volver=%2Faccounts");
    await flush();
    mountAccessPanel.mock.calls[0]![1].onModeChange(null);
    expect(location.search).toBe("");
  });
});
