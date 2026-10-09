import i18next, { type i18n as I18nInstance } from "i18next";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";

import { configureClient } from "@finance/client";

import { LangProvider } from "../../i18n/lang";
import { API_URL } from "../../lib/config";
import type { Language } from "../../lib/language";
import { appUrl } from "../../lib/returnTo";
import { AuthPanel } from "./components/AuthPanel";
import { AccessProvider } from "./hooks/useAuth";
import type { AuthPanelMode } from "./lib/authRedirect";

/**
 * The access panel, loaded only when someone opens it (spec 031, R7): `scripts/access.ts` imports
 * this module on the first click or when the address already asks for it, mounts it once into the
 * page's `#access-root`, and from then on drives it through the returned controller. A successful
 * sign-in or registration leaves for the app at the path the visitor was going to (`volver`), with
 * the session in the API's cookies — never a token in the address.
 */
export interface AccessPanelController {
  open: (mode: AuthPanelMode) => void;
  close: () => void;
}

interface MountOptions {
  lang: Language;
  initialMode: AuthPanelMode | null;
  /** Called when the panel opens on another view or closes, so the address can follow. */
  onModeChange: (mode: AuthPanelMode | null) => void;
  /** Where to go once signed in; defaults to `volver` in the current address. */
  returnTo: () => string | null;
  /** Navigation seam for tests. */
  navigate?: (url: string) => void;
}

/** The panel's strings in the page's language only — never the whole app catalog, nor the other
 * language: one small chunk per language, loaded with the panel. */
async function loadI18n(lang: Language): Promise<I18nInstance> {
  const catalog = lang === "en" ? await import("./catalog/en") : await import("./catalog/es");
  const instance = i18next.createInstance();
  await instance.init({
    resources: { [lang]: { translation: { ...catalog } } },
    lng: lang,
    interpolation: { escapeValue: false },
  });
  return instance;
}

export async function mountAccessPanel(
  root: HTMLElement,
  options: MountOptions,
): Promise<AccessPanelController> {
  configureClient({ baseUrl: API_URL });
  const i18n = await loadI18n(options.lang);

  let setModeFromOutside: ((mode: AuthPanelMode | null) => void) | null = null;
  let pending: AuthPanelMode | null | undefined;

  function AccessPanelRoot() {
    const [mode, setMode] = useState<AuthPanelMode | null>(options.initialMode);

    useEffect(() => {
      setModeFromOutside = setMode;
      if (pending !== undefined) setMode(pending);
      return () => {
        setModeFromOutside = null;
      };
    }, []);

    return (
      <I18nextProvider i18n={i18n}>
        <LangProvider lang={options.lang}>
          <AccessProvider locale={options.lang}>
            <AuthPanel
              mode={mode}
              onModeChange={(next) => {
                setMode(next);
                options.onModeChange(next);
              }}
              onAuthenticated={() => {
                const navigate = options.navigate ?? ((url: string) => location.assign(url));
                navigate(appUrl(options.returnTo()));
              }}
            />
          </AccessProvider>
        </LangProvider>
      </I18nextProvider>
    );
  }

  createRoot(root).render(<AccessPanelRoot />);

  const drive = (mode: AuthPanelMode | null) => {
    if (setModeFromOutside) setModeFromOutside(mode);
    else pending = mode;
  };
  return { open: (mode) => drive(mode), close: () => drive(null) };
}
