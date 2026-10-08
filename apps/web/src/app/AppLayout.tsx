import * as RadixDialog from "@radix-ui/react-dialog";
import {
  ArrowLeftRight,
  CircleDollarSign,
  CreditCard,
  HandCoins,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  PiggyBank,
  Plus,
  Repeat,
  Upload,
  UserRound,
  Wallet,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, useLocation } from "react-router";

import { minWidth } from "../../breakpoints";
import { useAuth } from "../domains/auth/hooks/useAuth";
import { ThemeSync } from "../domains/profile/components/ThemeSync";
import { TransactionCreateModal } from "../domains/transactions/components/TransactionCreateModal";
import { cn } from "../shared/lib/cn";
import { getInitials } from "../shared/lib/initials";
import { useMediaQuery } from "../shared/lib/useMediaQuery";
import { BrandMark } from "../shared/ui/brand-mark";
import { Button } from "../shared/ui/button";

interface NavItem {
  to: string;
  key: string;
  icon: LucideIcon;
  end?: boolean;
}

const PANEL: NavItem = { to: "/", key: "nav.dashboard", icon: LayoutDashboard, end: true };
const ACCOUNTS: NavItem = { to: "/accounts", key: "accounts.title", icon: Wallet };
const MOVEMENTS: NavItem = { to: "/transactions", key: "transactions.title", icon: ArrowLeftRight };
const IMPORT: NavItem = { to: "/import", key: "import.title", icon: Upload };
const INSTALLMENTS: NavItem = { to: "/installments", key: "installments.title", icon: CreditCard };
const DEBTS: NavItem = { to: "/debts", key: "debts.title", icon: HandCoins };
const RECURRING: NavItem = { to: "/recurring", key: "recurring.title", icon: Repeat };
const SAVINGS: NavItem = { to: "/savings", key: "savings.title", icon: PiggyBank };
const EXCHANGE_RATES: NavItem = {
  to: "/exchange-rates",
  key: "nav.exchangeRates",
  icon: CircleDollarSign,
};

/** Grouped by what each section IS for the user: their money, what they've committed to, their
 * goals. Investments is left out until it exists (an item that leads nowhere is daily noise). */
const GROUPS: { key: string | null; items: NavItem[] }[] = [
  { key: null, items: [PANEL] },
  { key: "nav.groups.money", items: [ACCOUNTS, MOVEMENTS, EXCHANGE_RATES, IMPORT] },
  { key: "nav.groups.commitments", items: [INSTALLMENTS, DEBTS, RECURRING] },
  { key: "nav.groups.goals", items: [SAVINGS] },
];

/** Phone: four destinations and "+" in the tab bar; everything else in the "Más" sheet. */
const TAB_ITEMS: NavItem[] = [PANEL, ACCOUNTS, MOVEMENTS];
const SHEET_ITEMS: NavItem[] = [INSTALLMENTS, DEBTS, RECURRING, SAVINGS, EXCHANGE_RATES, IMPORT];

const SIDEBAR_COLLAPSED_KEY = "finance.sidebarCollapsed";

function readCollapsed(): boolean {
  return globalThis.localStorage?.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
}

function UserAvatar({
  name,
  email,
  className,
}: Readonly<{
  name: string | null | undefined;
  email: string | null | undefined;
  className?: string;
}>) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground",
        className,
      )}
      aria-hidden
    >
      {getInitials(name ?? null, email ?? null)}
    </span>
  );
}

/** The rail's own label: shown on hover AND on keyboard focus (a native `title` does neither
 * reliably, and never on touch). The control keeps its `aria-label`; this is visual only. */
function RailTip({ children }: Readonly<{ children: string }>) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute left-full top-1/2 z-40 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
    >
      {children}
    </span>
  );
}

const RAIL_BUTTON =
  "group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The open sidebar: brand + collapse, "Nuevo movimiento", the grouped sections and the user.
 * The active section is a soft fill with a thin mark at the edge, not a solid block competing
 * with the content.
 */
function SidebarOpen({
  onCollapse,
  onNew,
}: Readonly<{ onCollapse?: () => void; onNew: () => void }>) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  return (
    <>
      <div className="flex items-center gap-2 px-1.5 py-2">
        <BrandMark className="h-6 w-6" />
        <span className="text-lg font-semibold">{t("brand.name")}</span>
        {onCollapse ? (
          <button
            type="button"
            onClick={onCollapse}
            aria-label={t("nav.collapse")}
            title={t("nav.collapse")}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <PanelLeftClose className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>

      <Button className="mt-2 w-full" onClick={onNew}>
        <Plus className="h-4 w-4" aria-hidden />
        {t("transactions.new")}
      </Button>

      <nav aria-label={t("nav.menu")} className="mt-1 flex flex-1 flex-col">
        {GROUPS.map((group) => (
          <div key={group.key ?? "top"} className="flex flex-col gap-0.5">
            {group.key ? (
              <p className="px-2.5 pb-1 pt-4 text-xs font-semibold text-muted-foreground">
                {t(group.key)}
              </p>
            ) : (
              <span className="pt-3" />
            )}
            {group.items.map(({ to, key, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "relative flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 font-semibold text-primary before:absolute before:-left-3 before:bottom-2 before:top-2 before:w-[3px] before:rounded-r before:bg-primary"
                      : "text-foreground hover:bg-muted",
                  )
                }
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {t(key)}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="mt-4 flex items-center gap-1 border-t pt-3">
        <NavLink
          to="/profile"
          className={({ isActive }) =>
            cn(
              "flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              isActive && "text-foreground",
            )
          }
        >
          <UserAvatar name={user?.name} email={user?.email} className="h-7 w-7 text-xs" />
          <span className="min-w-0 flex-1 text-left leading-tight">
            <span className="block truncate text-sm font-medium text-foreground">
              {user?.name || user?.email}
            </span>
            {user?.name ? <span className="block truncate">{user?.email}</span> : null}
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
    </>
  );
}

/** The contracted sidebar: icons only, each with its own label on hover/focus, "+" on top. */
function SidebarRail({ onExpand, onNew }: Readonly<{ onExpand?: () => void; onNew: () => void }>) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  return (
    <>
      <span className="flex h-10 items-center justify-center">
        <BrandMark className="h-6 w-6" />
      </span>
      {onExpand ? (
        <button
          type="button"
          onClick={onExpand}
          aria-label={t("nav.expand")}
          className={RAIL_BUTTON}
        >
          <PanelLeftOpen className="h-[18px] w-[18px]" aria-hidden />
          <RailTip>{t("nav.expand")}</RailTip>
        </button>
      ) : null}
      <button
        type="button"
        onClick={onNew}
        aria-label={t("transactions.new")}
        className={cn(
          RAIL_BUTTON,
          "mt-1 bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
        )}
      >
        <Plus className="h-5 w-5" aria-hidden />
        <RailTip>{t("transactions.new")}</RailTip>
      </button>

      <nav aria-label={t("nav.menu")} className="mt-1 flex flex-col items-center gap-1">
        {GROUPS.map((group, gi) => (
          <div key={group.key ?? "top"} className="flex flex-col items-center gap-1">
            {gi > 0 ? <span className="my-1 h-px w-7 bg-border" aria-hidden /> : null}
            {group.items.map(({ to, key, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                aria-label={t(key)}
                className={({ isActive }) =>
                  cn(
                    RAIL_BUTTON,
                    isActive && "bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary",
                  )
                }
              >
                <Icon className="h-[18px] w-[18px]" aria-hidden />
                <RailTip>{t(key)}</RailTip>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="mt-auto flex flex-col items-center gap-1 border-t pt-3">
        <NavLink to="/profile" aria-label={t("profile.title")} className={RAIL_BUTTON}>
          <UserAvatar name={user?.name} email={user?.email} className="h-8 w-8 text-xs" />
          <RailTip>{t("profile.title")}</RailTip>
        </NavLink>
        <button
          type="button"
          aria-label={t("auth.logout")}
          onClick={() => void logout()}
          className={RAIL_BUTTON}
        >
          <LogOut className="h-4 w-4" aria-hidden />
          <RailTip>{t("auth.logout")}</RailTip>
        </button>
      </div>
    </>
  );
}

/** Phone: the bottom tab bar (in thumb reach) and the "Más" sheet with the rest. */
function PhoneNav({ onNew }: Readonly<{ onNew: () => void }>) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const inSheet = [...SHEET_ITEMS.map((i) => i.to), "/profile"].some((to) =>
    pathname.startsWith(to),
  );

  const tab = (active: boolean) =>
    cn(
      "flex flex-col items-center gap-0.5 rounded-lg py-1 text-[11px] transition-colors",
      active ? "font-semibold text-primary" : "text-muted-foreground",
    );

  return (
    <>
      <nav
        aria-label={t("nav.menu")}
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 items-end border-t bg-card px-1 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] pt-1.5"
      >
        {TAB_ITEMS.slice(0, 2).map(({ to, key, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => tab(isActive)}>
            <Icon className="h-5 w-5" aria-hidden />
            {t(key)}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={onNew}
          aria-label={t("transactions.new")}
          className="flex justify-center pb-1"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md transition-transform duration-150 active:scale-95">
            <Plus className="h-5 w-5" aria-hidden />
          </span>
        </button>
        {TAB_ITEMS.slice(2).map(({ to, key, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => tab(isActive)}>
            <Icon className="h-5 w-5" aria-hidden />
            {t(key)}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          className={tab(inSheet)}
        >
          <MoreHorizontal className="h-5 w-5" aria-hidden />
          {t("nav.more")}
        </button>
      </nav>

      <RadixDialog.Root open={moreOpen} onOpenChange={setMoreOpen}>
        <RadixDialog.Portal>
          <RadixDialog.Overlay className="fixed inset-0 z-overlay bg-black/50" />
          <RadixDialog.Content className="fixed inset-x-0 bottom-0 z-modal flex flex-col gap-3 rounded-t-2xl border-t bg-card px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-3 focus:outline-none">
            <span className="mx-auto h-1 w-9 rounded-full bg-border2" aria-hidden />
            <RadixDialog.Title className="sr-only">{t("nav.moreSections")}</RadixDialog.Title>
            <div className="grid grid-cols-3 gap-2">
              {[...SHEET_ITEMS, { to: "/profile", key: "profile.title", icon: UserRound }].map(
                ({ to, key, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setMoreOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "flex flex-col items-center gap-1.5 rounded-xl px-1 py-3 text-xs font-medium transition-colors",
                        isActive ? "bg-primary/10 text-primary" : "bg-muted text-foreground",
                      )
                    }
                  >
                    <Icon className="h-5 w-5 text-primary" aria-hidden />
                    {t(key)}
                  </NavLink>
                ),
              )}
            </div>
            <div className="flex items-center gap-2 border-t pt-3">
              <UserAvatar name={user?.name} email={user?.email} className="h-8 w-8 text-xs" />
              <span className="min-w-0 flex-1 truncate text-sm">{user?.name || user?.email}</span>
              <button
                type="button"
                onClick={() => void logout()}
                className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <LogOut className="h-4 w-4" aria-hidden />
                {t("auth.logout")}
              </button>
            </div>
          </RadixDialog.Content>
        </RadixDialog.Portal>
      </RadixDialog.Root>
    </>
  );
}

/**
 * Signed-in shell. Three forms, by viewport (the stage table in `breakpoints.ts`):
 *  - phone (< `sm`): a top bar with the brand, the bottom tab bar and the "Más" sheet;
 *  - tablet (`sm` to `lg`): the sidebar as a rail of icons, always;
 *  - from `lg`: the open sidebar, which the user can contract to the rail (remembered).
 * Contracting switches at once — no width animation: it's a frequent gesture, and animating
 * the width would slide the whole page. "Nuevo movimiento" is reachable from every form, so the
 * modal lives here.
 */
export function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  const { t } = useTranslation();
  const isTablet = useMediaQuery(minWidth("sm"));
  const isLarge = useMediaQuery(minWidth("lg"));
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [newOpen, setNewOpen] = useState(false);
  const rail = !isLarge || collapsed;

  useEffect(() => {
    globalThis.localStorage?.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  const openNew = () => setNewOpen(true);

  return (
    // `app-shell`: the document itself never scrolls here (only <main> does), so
    // `styles/index.css` drops the page-scrollbar gutter for it.
    <div className="app-shell flex h-dvh overflow-hidden">
      <ThemeSync />
      {isTablet ? (
        <aside
          className={cn(
            "relative z-20 flex h-full shrink-0 flex-col border-r bg-card",
            // The rail can't scroll: overflow would clip its labels, which stick out to the right.
            rail
              ? "w-[4.5rem] items-center gap-1 px-2 py-3"
              : "scrollbar-thin w-60 overflow-y-auto p-3",
          )}
        >
          {rail ? (
            <SidebarRail
              onExpand={isLarge ? () => setCollapsed(false) : undefined}
              onNew={openNew}
            />
          ) : (
            <SidebarOpen onCollapse={() => setCollapsed(true)} onNew={openNew} />
          )}
        </aside>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {isTablet ? null : (
          <header className="flex shrink-0 items-center gap-2 border-b bg-card px-4 py-3">
            <BrandMark className="h-6 w-6" />
            <span className="font-semibold">{t("brand.name")}</span>
          </header>
        )}
        <main
          className={cn(
            "scrollbar-thin min-h-0 flex-1 overflow-y-auto overflow-x-hidden",
            !isTablet && "pb-[calc(4.75rem+env(safe-area-inset-bottom,0px))]",
          )}
        >
          <div className="container py-6">{children}</div>
        </main>
      </div>

      {isTablet ? null : <PhoneNav onNew={openNew} />}
      <TransactionCreateModal open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}
