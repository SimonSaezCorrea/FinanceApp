import type { AccessPanelController } from "../../auth/mountAccessPanel";
import {
  AUTH_PARAM,
  type AuthPanelMode,
  RETURN_PARAM,
  authModeFromParam,
  authModeParam,
} from "../../auth/lib/authRedirect";
import { isLanguage } from "../../../lib/language";

/**
 * Opens the access panel without shipping it (spec 031, R7): every "Iniciar sesión" / "Crear cuenta"
 * is a plain link to `?acceso=…`, so it works with no script at all; with script, a click is
 * caught here, the address gains the parameter, and the panel's module — React and the forms — is
 * imported only then. An address that already carries `?acceso=` (the app sending a signed-out
 * visitor, a bookmark) opens it on load.
 */
type Loader = () => Promise<typeof import("../../auth/mountAccessPanel")>;

const defaultLoader: Loader = () => import("../../auth/mountAccessPanel");

export function initAccess(loader: Loader = defaultLoader): void {
  const root = document.getElementById("access-root");
  if (!root) return;
  const lang = isLanguage(root.dataset.lang) ? root.dataset.lang : "es";

  let controller: Promise<AccessPanelController> | null = null;

  const modeInAddress = () =>
    authModeFromParam(new URLSearchParams(location.search).get(AUTH_PARAM));

  const writeAddress = (mode: AuthPanelMode | null, push: boolean) => {
    const url = new URL(location.href);
    if (mode) url.searchParams.set(AUTH_PARAM, authModeParam(mode));
    else {
      url.searchParams.delete(AUTH_PARAM);
      url.searchParams.delete(RETURN_PARAM);
    }
    if (url.href === location.href) return;
    if (push) history.pushState(null, "", url);
    else history.replaceState(null, "", url);
  };

  const panel = (initialMode: AuthPanelMode | null) => {
    controller ??= loader().then(({ mountAccessPanel }) =>
      mountAccessPanel(root, {
        lang,
        initialMode,
        onModeChange: (mode) => writeAddress(mode, false),
        returnTo: () => new URLSearchParams(location.search).get(RETURN_PARAM),
      }),
    );
    return controller;
  };

  const open = (mode: AuthPanelMode) => {
    if (controller) void controller.then((c) => c.open(mode));
    else void panel(mode);
  };

  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[data-access]");
    const mode = authModeFromParam(link?.dataset.access);
    if (!link || !mode) return;
    event.preventDefault();
    // The phone menu is a native modal <dialog> in the top layer: it would cover the panel.
    const menu = document.querySelector<HTMLDialogElement>("dialog[data-menu]");
    if (menu?.open) menu.close();
    writeAddress(mode, true);
    open(mode);
  });

  // Back/forward move between "panel open" and "panel closed" like any page state.
  window.addEventListener("popstate", () => {
    const mode = modeInAddress();
    if (mode) open(mode);
    else if (controller) void controller.then((c) => c.close());
  });

  const initial = modeInAddress();
  if (initial) void panel(initial);
}
