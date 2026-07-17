import * as RadixDialog from "@radix-ui/react-dialog";
import {
  ArrowLeftRight,
  ChevronLeft,
  CreditCard,
  HandCoins,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  Menu,
  PiggyBank,
  Receipt,
  Repeat,
  TrendingUp,
  Upload,
  Wallet,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";

import { useAuth } from "../domains/auth/hooks/useAuth";
import { ThemeSync } from "../domains/profile/components/ThemeSync";
import { ThemeToggle } from "../shared/ui/theme-toggle";
import { cn } from "../shared/lib/cn";
import { getInitials } from "../shared/lib/initials";

function UserAvatar({
  name,
  email,
  className,
}: {
  name: string | null | undefined;
  email: string | null | undefined;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand to-accent font-semibold text-primary-foreground",
        className,
      )}
      aria-hidden
    >
      {getInitials(name ?? null, email ?? null)}
    </span>
  );
}

const NAV: { to: string; key: string; icon: LucideIcon; end?: boolean }[] = [
  { to: "/", key: "nav.dashboard", icon: LayoutDashboard, end: true },
  { to: "/accounts", key: "accounts.title", icon: Wallet },
  { to: "/transactions", key: "transactions.title", icon: ArrowLeftRight },
  { to: "/installments", key: "installments.title", icon: CreditCard },
  { to: "/debts", key: "debts.title", icon: HandCoins },
  { to: "/recurring", key: "recurring.title", icon: Repeat },
  { to: "/savings", key: "savings.title", icon: PiggyBank },
  { to: "/investments", key: "investments.title", icon: TrendingUp },
  { to: "/import", key: "import.title", icon: Upload },
];

const SIDEBAR_COLLAPSED_KEY = "finance.sidebarCollapsed";

function readCollapsed(): boolean {
  return globalThis.localStorage?.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
}

function NavLinks({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { t } = useTranslation();
  return (
    <nav className="mt-2 flex flex-1 flex-col gap-1">
      {NAV.map(({ to, key, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          title={collapsed ? t(key) : undefined}
          className={({ isActive }) =>
            cn(
              "flex items-center rounded-md py-2 pl-[15.5px] pr-3 text-sm font-medium transition-colors",
              isActive ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
            )
          }
        >
          <Icon className="h-4 w-4 shrink-0" aria-hidden />
          <span
            className={cn(
              "min-w-0 overflow-hidden whitespace-nowrap transition-all duration-200",
              collapsed ? "max-w-0 pl-0 opacity-0" : "max-w-[10rem] pl-3 opacity-100",
            )}
          >
            {t(key)}
          </span>
        </NavLink>
      ))}
    </nav>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);

  useEffect(() => {
    globalThis.localStorage?.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  return (
    <div className="flex h-dvh overflow-hidden">
      <ThemeSync />
      <div
        className={cn(
          "relative hidden shrink-0 transition-[width] duration-300 ease-in-out md:block",
          collapsed ? "w-20" : "w-60",
        )}
      >
        <aside className="flex h-full flex-col overflow-y-auto border-r bg-card p-4">
          <div className="flex items-center py-3 pl-[13.5px]">
            <Receipt className="h-5 w-5 shrink-0 text-brand" aria-hidden />
            <span
              className={cn(
                "min-w-0 overflow-hidden whitespace-nowrap text-lg font-semibold transition-all duration-200",
                collapsed ? "max-w-0 pl-0 opacity-0" : "max-w-[10rem] pl-2 opacity-100",
              )}
            >
              {t("brand.name")}
            </span>
          </div>

          <NavLinks collapsed={collapsed} />

          <div
            className={cn(
              "mt-auto flex items-center border-t pt-3",
              collapsed ? "flex-col gap-2" : "gap-1",
            )}
          >
            <NavLink
              to="/profile"
              title={collapsed ? t("profile.title") : undefined}
              className={({ isActive }) =>
                cn(
                  "flex min-w-0 items-center gap-2 rounded-md text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  collapsed ? "h-8 w-8 justify-center" : "flex-1 px-1 py-1",
                  isActive && "text-foreground",
                )
              }
            >
              <UserAvatar name={user?.name} email={user?.email} className="h-7 w-7 text-xs" />
              {collapsed ? null : (
                <span className="min-w-0 flex-1 text-left leading-tight">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {user?.name || user?.email}
                  </span>
                  {user?.name ? (
                    <span className="block truncate text-muted-foreground">{user?.email}</span>
                  ) : null}
                </span>
              )}
            </NavLink>
            <button
              type="button"
              title={t("auth.logout")}
              aria-label={t("auth.logout")}
              onClick={() => void logout()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <LogOut className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </aside>

        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}
          className="absolute -right-3 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft
            className={cn(
              "h-3.5 w-3.5 transition-transform duration-300",
              collapsed && "rotate-180",
            )}
            aria-hidden
          />
        </button>
      </div>

      <RadixDialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <RadixDialog.Portal>
          <RadixDialog.Overlay className="fixed inset-0 z-overlay bg-black/50 md:hidden" />
          <RadixDialog.Content className="fixed inset-y-0 left-0 z-modal flex w-64 flex-col border-r bg-card p-4 focus:outline-none md:hidden">
            <RadixDialog.Title className="sr-only">{t("nav.menu")}</RadixDialog.Title>
            <div className="flex items-center justify-between gap-2 px-2 py-3">
              <span className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-brand" aria-hidden />
                <span className="text-lg font-semibold">{t("brand.name")}</span>
              </span>
              <RadixDialog.Close
                className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                aria-label={t("nav.close")}
              >
                <X className="h-5 w-5" aria-hidden />
              </RadixDialog.Close>
            </div>

            <NavLinks collapsed={false} onNavigate={() => setMobileOpen(false)} />

            <div className="mt-auto flex items-center gap-1 border-t pt-3">
              <NavLink
                to="/profile"
                onClick={() => setMobileOpen(false)}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <UserAvatar name={user?.name} email={user?.email} className="h-7 w-7 text-xs" />
                <span className="min-w-0 flex-1 text-left leading-tight">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {user?.name || user?.email}
                  </span>
                  {user?.name ? (
                    <span className="block truncate text-muted-foreground">{user?.email}</span>
                  ) : null}
                </span>
              </NavLink>
              <button
                type="button"
                title={t("auth.logout")}
                aria-label={t("auth.logout")}
                onClick={() => void logout()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <LogOut className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </RadixDialog.Content>
        </RadixDialog.Portal>
      </RadixDialog.Root>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b bg-card px-4 py-3 md:hidden">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label={t("nav.open")}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Menu className="h-5 w-5" aria-hidden />
            </button>
            <Receipt className="h-5 w-5 text-brand" aria-hidden />
            <span className="font-semibold">{t("brand.name")}</span>
          </div>
          <ThemeToggle />
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <div className="container py-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
