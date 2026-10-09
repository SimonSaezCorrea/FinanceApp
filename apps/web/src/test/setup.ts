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
