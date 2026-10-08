import { ChevronRight, Menu } from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
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
import { Window } from "../../../shared/ui/overlay";
import { ThemeSegmented } from "../../../shared/ui/theme-segmented";
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
  const headerRef = useRef<HTMLElement>(null);
  const lastPathname = useRef<string | null>(null);
  const navigationType = useNavigationType();
  const [menuOpen, setMenuOpen] = useState(false);
  // The sticky header changes height with the width (one row from `lg`, two on a tablet, plus
  // the notch inset), so it publishes its own height for whatever sticks below it.
  const [headerHeight, setHeaderHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const measure = () => setHeaderHeight(header.offsetHeight);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

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
      <div
        className="min-h-dvh overflow-x-clip bg-background text-foreground"
        style={
          headerHeight === null
            ? undefined
            : ({ "--landing-header": `${headerHeight}px` } as CSSProperties)
        }
      >
        <a
          href="#landing-main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-foreground focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-background"
        >
          {t("landing.skipToContent")}
        </a>
        {/* Three forms, one nav: on a phone the sections live in a full-screen menu (the nav is
            hidden); on a tablet the nav drops to its own scrollable row of tabs under the brand;
            from `lg` everything sits on one line. */}
        <header
          ref={headerRef}
          className="sticky top-0 z-40 border-b bg-background/85 pt-[env(safe-area-inset-top,0px)] backdrop-blur"
        >
          <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-2 px-4 pt-3 pb-3 sm:gap-x-3 sm:pb-0 lg:gap-x-6 lg:pb-3">
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
              className="order-last hidden basis-full gap-7 overflow-x-auto text-sm [scrollbar-width:none] sm:flex lg:order-none lg:basis-auto lg:gap-6 lg:overflow-visible"
              aria-label={t("landing.nav.label")}
            >
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      // 44px tall below `lg`, where the row is touched rather than clicked.
                      "flex min-h-11 shrink-0 items-center font-medium transition-colors lg:min-h-0",
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
              <div className="hidden sm:block">
                <ThemeToggle />
              </div>
              {user ? (
                <Button className="h-11 sm:h-10" onClick={() => navigate("/")}>
                  {t("landing.nav.goToApp")}
                </Button>
              ) : (
                <Button className="h-11 sm:h-10" onClick={() => setAuthMode("login")}>
                  {t("auth.signIn")}
                </Button>
              )}
              <Button
                variant="outline"
                className="h-11 w-11 px-0 sm:hidden"
                aria-label={t("landing.nav.openMenu")}
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen(true)}
              >
                <Menu className="h-5 w-5" aria-hidden />
              </Button>
            </div>
          </div>
        </header>

        <LandingMenu
          open={menuOpen}
          onOpenChange={setMenuOpen}
          signedIn={Boolean(user)}
          onGoToApp={() => navigate("/")}
          onOpenAuth={(mode) => {
            setMenuOpen(false);
            setAuthMode(mode);
          }}
        />

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
                  className="inline-flex min-h-11 items-center transition-colors hover:text-foreground sm:min-h-0"
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

/** The phone form of the header: sections, theme and access in one full-screen sheet, so the
 * header itself only has to hold the brand, the sign-in and the button that opens this. */
function LandingMenu({
  open,
  onOpenChange,
  signedIn,
  onGoToApp,
  onOpenAuth,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  signedIn: boolean;
  onGoToApp: () => void;
  onOpenAuth: (mode: AuthPanelMode) => void;
}>) {
  const { t } = useTranslation();
  return (
    <Window
      open={open}
      onOpenChange={onOpenChange}
      title={t("landing.nav.menu")}
      className="bg-card pb-[env(safe-area-inset-bottom,0px)] pt-[env(safe-area-inset-top,0px)]"
      footer={
        signedIn ? (
          <Button size="lg" className="w-full" onClick={onGoToApp}>
            {t("landing.nav.goToApp")}
          </Button>
        ) : (
          <div className="flex flex-col gap-2">
            <Button size="lg" className="w-full" onClick={() => onOpenAuth("register")}>
              {t("auth.createAccount")}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="w-full"
              onClick={() => onOpenAuth("login")}
            >
              {t("auth.signIn")}
            </Button>
          </div>
        )
      }
    >
      {/* Rules only BETWEEN sections: the sheet's header already draws the line above the
          first one, and a second rule there read as a double border. */}
      {/* A column as tall as the sheet's body, so the theme switch can sit at its foot, right
          above the access buttons, with the sections at the top. */}
      <div className="flex min-h-full flex-col pb-4">
        <nav aria-label={t("landing.nav.label")} className="-mt-2 flex flex-col divide-y">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => onOpenChange(false)}
              className={({ isActive }) =>
                cn(
                  "flex min-h-14 items-center justify-between text-lg font-semibold tracking-tight transition-colors active:bg-muted/60",
                  isActive ? "text-primary" : "text-foreground",
                )
              }
            >
              {t(item.key)}
              <ChevronRight className="h-5 w-5 text-muted-foreground" aria-hidden />
            </NavLink>
          ))}
        </nav>
        <MenuThemeSwitch />
      </div>
    </Window>
  );
}

/** The theme choice at phone size: the shared `ThemeToggle` is a compact icon strip for the
 * sidebar (28px targets), too small to tap and too terse in a sheet with room to spare, so the
 * sheet uses the named 44px segments. No visible label: the three named options say what this is;
 * the group keeps its accessible name for screen readers. */
function MenuThemeSwitch() {
  return (
    <div className="mt-auto pt-8">
      <ThemeSegmented />
    </div>
  );
}
