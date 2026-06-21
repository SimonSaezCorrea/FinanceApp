import {
  ArrowLeftRight,
  CreditCard,
  HandCoins,
  LayoutDashboard,
  type LucideIcon,
  PiggyBank,
  Receipt,
  Repeat,
  TrendingUp,
  Upload,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";

import { useAuth } from "../domains/auth/hooks/useAuth";
import { Button } from "../shared/ui/button";
import { ThemeToggle } from "../shared/ui/theme-toggle";
import { cn } from "../shared/lib/cn";

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

export function AppLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-card p-4 md:flex">
        <div className="flex items-center gap-2 px-2 py-3">
          <Receipt className="h-5 w-5 text-brand" aria-hidden />
          <span className="text-lg font-semibold">{t("brand.name")}</span>
        </div>
        <nav className="mt-2 flex flex-1 flex-col gap-1">
          {NAV.map(({ to, key, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-muted",
                )
              }
            >
              <Icon className="h-4 w-4" aria-hidden />
              {t(key)}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-3 border-t pt-3">
          <ThemeToggle />
          <span className="truncate px-1 text-xs text-muted-foreground">{user?.email}</span>
          <Button variant="outline" size="sm" onClick={() => void logout()}>
            {t("auth.logout")}
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b bg-card px-4 py-3 md:hidden">
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-brand" aria-hidden />
            <span className="font-semibold">{t("brand.name")}</span>
          </div>
          <ThemeToggle />
        </header>
        <main className="flex-1 overflow-x-hidden">
          <div className="container py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
