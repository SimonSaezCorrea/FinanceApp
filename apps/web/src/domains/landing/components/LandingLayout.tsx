import { type ReactNode, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Link,
  NavLink,
  useLocation,
  useNavigate,
  useNavigationType,
  useSearchParams,
} from "react-router";

import { cn } from "../../../shared/lib/cn";
import { BrandMark } from "../../../shared/ui/brand-mark";
import { Button } from "../../../shared/ui/button";
import { ThemeToggle } from "../../../shared/ui/theme-toggle";
import { AuthPanel } from "../../auth/components/AuthPanel";
import { useAuth } from "../../auth/hooks/useAuth";
import {
  AUTH_PARAM,
  type AuthPanelMode,
  RETURN_PARAM,
  authModeFromParam,
  authModeParam,
  safeReturnTo,
} from "../../auth/lib/authRedirect";
import { LandingAuthContext } from "../hooks/useOpenAuth";

const NAV = [
  { to: "/nosotros", key: "landing.nav.about" },
  { to: "/privacidad", key: "landing.nav.privacy" },
  { to: "/precios", key: "landing.nav.pricing" },
  { to: "/preguntas", key: "landing.nav.faq" },
] as const;

const FOOTER_LINKS = [
  { to: "/privacidad", key: "landing.nav.privacy" },
  { to: "/precios", key: "landing.nav.pricing" },
  { to: "/preguntas", key: "landing.nav.faq" },
] as const;

/** Public chrome of the landing: skip link, sticky header (brand, sections, theme, access),
 * footer and the access side panel. Every public page renders inside it. */
export function LandingLayout({ children }: Readonly<{ children: ReactNode }>) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname, hash } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const mainRef = useRef<HTMLElement>(null);
  const lastPathname = useRef<string | null>(null);
  const navigationType = useNavigationType();

  // The access panel lives in the URL (`?acceso=login|registro`), so `/login`, `/register` and a
  // signed-out visit to a protected page can all open it, and a reload keeps it open.
  const authMode = authModeFromParam(searchParams.get(AUTH_PARAM));
  function setAuthMode(mode: AuthPanelMode | null) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (mode) {
          next.set(AUTH_PARAM, authModeParam(mode));
        } else {
          next.delete(AUTH_PARAM);
          next.delete(RETURN_PARAM);
        }
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }

  // A page change the reader asked for (a link, a tab) starts at the top with focus on its
  // heading. Only on a PATH change (opening the panel only touches the query), and not on POP
  // (first load, Back/Forward), so a deep link reads from the top and Back keeps the browser's
  // own scroll restoration. The ref starts null, so a page reached by PUSH counts on mount —
  // every public page mounts its own layout.
  useEffect(() => {
    const changed = lastPathname.current !== pathname;
    lastPathname.current = pathname;
    // A link with an anchor (`/preguntas#faq-minors`) lands on that anchor, not the top.
    if (!changed || navigationType === "POP" || hash) return;
    // With the panel open, focus belongs to it.
    if (!authMode) mainRef.current?.querySelector("h1")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, navigationType]);

  return (
    <LandingAuthContext.Provider value={setAuthMode}>
      {/* `overflow-x-clip` at the viewport, not per section: the home hero's tilted cards may
          reach past the content column, just never past the screen. */}
      <div className="min-h-dvh overflow-x-clip bg-background text-foreground">
        <a
          href="#landing-main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-foreground focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-background"
        >
          {t("landing.skipToContent")}
        </a>
        <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
          <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
            <Link to="/" className="mr-auto flex items-center gap-2.5">
              <BrandMark className="h-8 w-8" />
              <span className="flex flex-col leading-tight">
                <span className="text-base font-semibold tracking-tight">{t("brand.name")}</span>
                <span className="hidden text-xs text-muted-foreground sm:block">
                  {t("brand.slogan")}
                </span>
              </span>
            </Link>

            <nav
              className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm"
              aria-label={t("landing.nav.label")}
            >
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      "font-medium transition-colors",
                      isActive
                        ? "text-foreground underline decoration-primary decoration-2 underline-offset-8"
                        : "text-muted-foreground hover:text-foreground",
                    )
                  }
                >
                  {t(item.key)}
                </NavLink>
              ))}
            </nav>

            <div className="flex items-center gap-2">
              <ThemeToggle />
              {user ? (
                <Button onClick={() => navigate("/")}>{t("landing.nav.goToApp")}</Button>
              ) : (
                <Button onClick={() => setAuthMode("login")}>{t("auth.signIn")}</Button>
              )}
            </div>
          </div>
        </header>

        <main
          ref={mainRef}
          id="landing-main"
          tabIndex={-1}
          className="mx-auto max-w-[1240px] px-4 focus:outline-none"
        >
          {children}

          <footer className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t py-8 text-xs text-muted-foreground">
            <span>{t("landing.footer.tagline")}</span>
            <nav
              aria-label={t("landing.footer.nav")}
              className="flex flex-wrap gap-x-5 gap-y-1 sm:ml-auto"
            >
              {FOOTER_LINKS.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="transition-colors hover:text-foreground"
                >
                  {t(item.key)}
                </Link>
              ))}
            </nav>
          </footer>
        </main>

        <AuthPanel
          // A signed-in visitor has nothing to sign in to.
          mode={user ? null : authMode}
          onModeChange={setAuthMode}
          onAuthenticated={() => {
            // Back to the page that sent them here (a protected route), or the Panel.
            navigate(safeReturnTo(searchParams.get(RETURN_PARAM)), { replace: true });
          }}
        />
      </div>
    </LandingAuthContext.Provider>
  );
}
