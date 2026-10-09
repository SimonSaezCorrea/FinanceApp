import type { ReactNode } from "react";

import { AccessProvider } from "../domains/auth/hooks/useAuth";
import { I18nRoot, getI18n } from "../i18n";
import type { Language } from "../lib/language";

/** What the access panel's forms run inside on a page: that page's translations and the
 * sign-in calls, in the page's language. */
export function Providers({
  lang = "es",
  children,
}: Readonly<{ lang?: Language; children: ReactNode }>) {
  return (
    <I18nRoot lang={lang}>
      <AccessProvider locale={lang}>{children}</AccessProvider>
    </I18nRoot>
  );
}

/** The Spanish instance, for looking labels up in assertions. */
export const i18n = getI18n("es");
