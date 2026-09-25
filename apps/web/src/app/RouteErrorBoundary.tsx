import { Home, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { isRouteErrorResponse, useRouteError } from "react-router";

import { BrandMark } from "../shared/ui/brand-mark";
import { Button } from "../shared/ui/button";
import { NotFoundRoute } from "./NotFoundRoute";

/** Replaces react-router's default "Unexpected Application Error!" screen. A 404 thrown by the
 * router gets the real not-found page; anything else is a crash, shown WITHOUT the app/landing
 * chrome — the layout itself may be what broke, so this page depends on nothing but the theme. */
export function RouteErrorBoundary() {
  const error = useRouteError();
  const { t } = useTranslation();

  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundRoute />;
  if (import.meta.env.DEV) console.error(error);

  return (
    <main
      role="alert"
      className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-6 text-center"
    >
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/10 ring-1 ring-brand/20">
        <BrandMark variant="full" className="h-12 w-12" />
      </span>
      <div className="flex max-w-md flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t("app.crash.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("app.crash.message")}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button variant="accent" onClick={() => window.location.reload()}>
          <RefreshCw className="h-4 w-4" aria-hidden />
          {t("app.crash.reload")}
        </Button>
        {/* A full navigation, not the router: after a crash its state is not to be trusted. */}
        <a
          href="/"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Home className="h-4 w-4" aria-hidden />
          {t("app.crash.home")}
        </a>
      </div>
    </main>
  );
}
