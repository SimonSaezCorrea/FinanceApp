import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, useLocation, useNavigate, useNavigationType } from "react-router";

import { cn } from "../../../shared/lib/cn";
import { Button } from "../../../shared/ui/button";
import { ThemeToggle } from "../../../shared/ui/theme-toggle";
import { AuthPanel, type AuthPanelMode } from "../../auth/components/AuthPanel";
import { useAuth } from "../../auth/hooks/useAuth";
import { LandingAuthContext } from "../hooks/useOpenAuth";

const NAV = [
  { to: "/producto", key: "landing.nav.product" },
  { to: "/nosotros", key: "landing.nav.about" },
  { to: "/privacidad", key: "landing.nav.privacy" },
  { to: "/precios", key: "landing.nav.pricing" },
  { to: "/preguntas", key: "landing.nav.faq" },
] as const;

/** Public chrome of the landing: sticky header (brand, sections, theme, access), footer and the
 * access side panel. Every public page renders inside it. */
export function LandingLayout({ children }: Readonly<{ children: ReactNode }>) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [authMode, setAuthMode] = useState<AuthPanelMode | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const navigationType = useNavigationType();

  // A page change the reader asked for (a link, a tab) starts at the top with focus on its
  // heading. Keyed on the navigation type, not on "first render": every public page mounts its
  // own layout, so a ref would reset on each page. POP (first load, Back/Forward) is left alone,
  // so a deep link reads from the top and Back keeps the browser's own scroll restoration.
  useEffect(() => {
    if (navigationType === "POP") return;
    mainRef.current?.querySelector("h1")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [pathname, navigationType]);

  return (
    <LandingAuthContext.Provider value={setAuthMode}>
      {/* `overflow-x-clip` at the viewport, not per section: the home hero's tilted cards may
          reach past the content column, just never past the screen. */}
      <div className="min-h-dvh overflow-x-clip bg-background text-foreground">
        <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
          <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
            <Link to="/" className="mr-auto flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-primary text-sm font-bold text-primary-foreground">
                FA
              </span>
              <span className="text-base font-semibold tracking-tight">{t("brand.name")}</span>
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

        <main ref={mainRef} className="mx-auto max-w-[1240px] px-4">
          {children}

          <footer className="flex flex-wrap gap-x-6 gap-y-2 border-t py-8 text-xs text-muted-foreground">
            <span>{t("landing.footer.tagline")}</span>
            <span>{t("landing.footer.sample")}</span>
            <Link to="/preguntas" className="ml-auto transition-colors hover:text-foreground">
              {t("landing.nav.faq")}
            </Link>
          </footer>
        </main>

        <AuthPanel
          mode={authMode}
          onModeChange={setAuthMode}
          onAuthenticated={() => {
            setAuthMode(null);
            navigate("/");
          }}
        />
      </div>
    </LandingAuthContext.Provider>
  );
}
