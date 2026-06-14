import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";

import { useAuth } from "../domains/auth/hooks/useAuth";
import { Button } from "../shared/ui/button";
import { cn } from "../shared/lib/cn";

const NAV = [
  { to: "/", key: "nav.dashboard", end: true },
  { to: "/accounts", key: "accounts.title" },
  { to: "/transactions", key: "transactions.title" },
  { to: "/installments", key: "installments.title" },
  { to: "/debts", key: "debts.title" },
  { to: "/savings", key: "savings.title" },
  { to: "/investments", key: "investments.title" },
  { to: "/import", key: "import.title" },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-card p-4 md:flex">
        <div className="px-2 py-3 text-lg font-semibold">{t("brand.name")}</div>
        <nav className="mt-2 flex flex-1 flex-col gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
                )
              }
            >
              {t(item.key)}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2 border-t pt-3">
          <span className="truncate px-2 text-xs text-muted-foreground">{user?.email}</span>
          <Button variant="outline" size="sm" onClick={() => void logout()}>
            {t("auth.logout")}
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">
        <div className="container py-8">{children}</div>
      </main>
    </div>
  );
}
