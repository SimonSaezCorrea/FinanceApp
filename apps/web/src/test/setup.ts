// jsdom doesn't implement matchMedia; libs like sonner (theme="system") need it.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

// Tests render in either language (the importer reads names in both, some suites switch to
// English): give them the English catalog up front, which the app itself loads on demand.
import en from "@finance/i18n/src/en.json";
import i18n from "../i18n";

i18n.addResourceBundle("en", "translation", en);

// findBy*/waitFor give up after 1 s by default. Lazy routes on a busy CI runner (the api's
// database tests used to share the machine) took longer and failed main twice on 2026-10-11 while
// passing locally, so every async query gets a realistic 5 s. A test that really fails still fails,
// just a few seconds later.
import { configure } from "@testing-library/react";

configure({ asyncUtilTimeout: 5000 });
