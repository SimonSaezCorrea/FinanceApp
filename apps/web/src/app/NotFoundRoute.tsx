import { ArrowLeft, Home } from "lucide-react";
import { Suspense } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router";

import { useAuth } from "../domains/auth/hooks/useAuth";
import { LeaveForLanding } from "../domains/auth/components/LeaveForLanding";
import { landingAccessUrl } from "../shared/lib/landingUrl";
import { AppSplash } from "@finance/ui/src/shared/ui/app-splash";
import { Button } from "@finance/ui/src/shared/ui/button";
import { AppLayout } from "./lazyPages";

/** Any URL no route claims. A signed-in user gets it inside the app (a dead link shouldn't also drop
 * the navigation); a signed-out visit is sent to sign in first, like any other address of the app
 * (spec 031), and lands back here afterwards. */
export function NotFoundRoute() {
  const { user, loading } = useAuth();
  const { pathname, search, hash } = useLocation();

  if (loading) return <AppSplash />;
  if (!user) return <LeaveForLanding url={landingAccessUrl("login", pathname + search + hash)} />;
  return (
    <Suspense fallback={<AppSplash />}>
      <AppLayout>
        <NotFoundPage />
      </AppLayout>
    </Suspense>
  );
}

function NotFoundPage() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  // `idx` is react-router's own history index: 0 means this page was the entry point (a pasted
  // or bookmarked link), so there's nothing inside the app to go back to.
  const canGoBack = ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0;

  return (
    <section
      aria-labelledby="not-found-title"
      className="flex flex-col items-center py-12 text-center sm:py-16"
    >
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t("app.notFound.eyebrow")}
      </span>
      <h1
        id="not-found-title"
        tabIndex={-1}
        className="mt-4 max-w-[20ch] text-3xl font-bold leading-tight tracking-tight focus:outline-none sm:text-4xl"
      >
        {t("app.notFound.title")}
      </h1>
      <p className="mt-4 max-w-[46ch] text-base text-muted-foreground">
        {t("app.notFound.message")}
      </p>
      <code className="mt-4 max-w-full truncate rounded-md bg-chip px-2.5 py-1 font-mono text-sm text-muted-foreground">
        {pathname}
      </code>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/"
          className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Home className="h-4 w-4" aria-hidden />
          {t("app.notFound.toPanel")}
        </Link>
        {canGoBack ? (
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {t("app.notFound.back")}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
