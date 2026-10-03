import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useMatches } from "react-router";

import { useAuth } from "../domains/auth/hooks/useAuth";
import { type TitleHandle, tabTitle } from "./tabTitle";

/**
 * Pathless root element: keeps `document.title` in step with the deepest matched route's
 * `handle` (and with the language), then renders the page. One place for every route, so a new
 * page only declares its title next to its path in the router.
 */
export function DocumentTitle() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const matches = useMatches();

  const handle = [...matches]
    .reverse()
    .map((match) => match.handle as TitleHandle | undefined)
    .find((h) => h?.title !== undefined || h?.signedInTitle !== undefined);
  const key = (user ? handle?.signedInTitle : undefined) ?? handle?.title;
  const title = tabTitle(t("brand.name"), key ? t(key) : null);

  useEffect(() => {
    document.title = title;
  }, [title, i18n.language]);

  return <Outlet />;
}
