import { createContext, type ReactNode, useContext } from "react";

import type { Language } from "../lib/language";

/** The page's language as React context, apart from the catalogs so the access panel can carry it
 * without loading them (spec 031, R7). */
const LangContext = createContext<Language>("es");

/** The page's language, for links that must stay in it (`pagePath(useLang(), …)`). */
export function useLang(): Language {
  return useContext(LangContext);
}

export function LangProvider({
  lang,
  children,
}: Readonly<{ lang: Language; children: ReactNode }>) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}
